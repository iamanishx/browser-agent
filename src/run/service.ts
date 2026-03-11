import { randomUUID } from "crypto";
import type { ModelMessage, ImagePart, FilePart, TextPart } from "ai";
import { buildAgentPrompt, createWebAgent } from "../agent/agents";
import {
    createSessionIfMissing,
    getSlidingWindowMessages,
    listPartsByMessageId,
    upsertMessage,
    upsertPart,
    type MessageRecord,
} from "../db/db";
import type { PartData } from "../db/schema";
import { sessionBus } from "../events/event-bus";

export type Attachment = {
    data: string;
    mimeType: string;
    name?: string;
};

export type SendMessageInput = {
    content: string;
    sessionId?: string;
    windowSize?: number;
    attachments?: Attachment[];
};

export type SendMessageResult = {
    sessionId: string;
    userMessageId: string;
};

const DEFAULT_WINDOW_SIZE = 15;

function normalizeWindowSize(windowSize?: number): number {
    if (!windowSize || Number.isNaN(windowSize) || windowSize < 1) {
        return DEFAULT_WINDOW_SIZE;
    }
    return Math.floor(windowSize);
}

function serializeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function buildUserContent(
    text: string,
    attachments: Attachment[],
): string | Array<TextPart | ImagePart | FilePart> {
    if (attachments.length === 0) return text;

    const parts: Array<TextPart | ImagePart | FilePart> = [
        { type: "text", text },
    ];

    for (const att of attachments) {
        if (att.mimeType.startsWith("image/")) {
            parts.push({
                type: "image",
                image: att.data,
                mediaType: att.mimeType,
            } as ImagePart);
        } else {
            parts.push({
                type: "file",
                data: att.data,
                mediaType: att.mimeType,
                filename: att.name,
            } as FilePart);
        }
    }

    return parts;
}

async function buildModelMessages(
    priorMessages: MessageRecord[],
    currentText: string,
    attachments: Attachment[],
): Promise<ModelMessage[]> {
    const history: ModelMessage[] = [];

    for (const m of priorMessages) {
        if (m.data.role === "user") {
            history.push({ role: "user", content: m.data.content });
        } else if (m.data.role === "assistant") {
            const msgParts = await listPartsByMessageId(m.id);
            const text = msgParts
                .filter((p) => p.data.type === "text")
                .map((p) => (p.data as { type: "text"; text: string }).text)
                .join("");
            if (text.length > 0) {
                history.push({ role: "assistant", content: text });
            }
        }
    }

    history.push({
        role: "user",
        content: buildUserContent(currentText, attachments),
    });

    return history;
}

export async function sendMessage(
    input: SendMessageInput,
): Promise<SendMessageResult> {
    const sessionId = input.sessionId ?? randomUUID();
    const windowSize = normalizeWindowSize(input.windowSize);
    const attachments = input.attachments ?? [];

    await createSessionIfMissing({ id: sessionId });

    const activeRun = sessionBus.getActiveRun(sessionId);
    if (activeRun) {
        sessionBus.cancelRun(sessionId);
        await Bun.sleep(100);
    }

    const userMessageId = randomUUID();
    const ts = Date.now();

    await upsertMessage({
        id: userMessageId,
        sessionId,
        data: {
            role: "user",
            content: input.content,
            time: { created: ts },
        },
    });

    sessionBus.emit(sessionId, {
        sessionId,
        messageId: userMessageId,
        type: "message-created",
        data: {
            role: "user",
            content: input.content,
            attachmentCount: attachments.length,
        },
        timestamp: ts,
    });

    const priorMessages = await getSlidingWindowMessages(sessionId, windowSize);

    const promptText = buildAgentPrompt({
        userPrompt: input.content,
        history: [],
        maxHistoryMessages: 0,
    });

    const modelMessages = await buildModelMessages(
        priorMessages,
        promptText,
        attachments,
    );

    const runId = randomUUID();
    const abortController = sessionBus.startRun(sessionId, runId);

    queueMicrotask(() => {
        void executeAgent({
            runId,
            sessionId,
            modelMessages,
            abortSignal: abortController.signal,
        });
    });

    return { sessionId, userMessageId };
}

type ExecuteAgentInput = {
    runId: string;
    sessionId: string;
    modelMessages: ModelMessage[];
    abortSignal: AbortSignal;
};

async function executeAgent(input: ExecuteAgentInput): Promise<void> {
    const { runId, sessionId, abortSignal } = input;
    let assistantText = "";
    const startTime = Date.now();

    const assistantMessageId = randomUUID();
    await upsertMessage({
        id: assistantMessageId,
        sessionId,
        data: {
            role: "assistant",
            time: { created: startTime },
            model: "claude-sonnet-4-5",
        },
    });

    sessionBus.emit(sessionId, {
        sessionId,
        messageId: assistantMessageId,
        type: "message-created",
        data: { role: "assistant", messageId: assistantMessageId },
        timestamp: startTime,
    });

    let textPartId: string | null = null;
    let textStartTime = 0;

    try {
        const agent = await createWebAgent({
            sessionId,
            messageId: assistantMessageId,
            abortSignal,
        });

        const result = await agent.stream({
            messages: input.modelMessages,
        });

        for await (const part of result.fullStream) {
            if (abortSignal.aborted) {
                console.log(`[Agent] Run ${runId} aborted`);
                break;
            }

            switch (part.type) {
                case "text-delta": {
                    assistantText += part.text;
                    process.stdout.write(part.text);

                    if (!textPartId) {
                        textPartId = randomUUID();
                        textStartTime = Date.now();
                    }

                    sessionBus.emit(sessionId, {
                        sessionId,
                        messageId: assistantMessageId,
                        partId: textPartId,
                        type: "part-delta",
                        data: { text: part.text, partId: textPartId },
                        timestamp: Date.now(),
                    });
                    break;
                }

                case "tool-call": {
                    console.log(
                        `[Tool call]: ${part.toolName}`,
                        JSON.stringify(part.input, null, 2),
                    );

                    if (textPartId && assistantText.trim().length > 0) {
                        const flushedTextData: PartData = {
                            type: "text",
                            text: assistantText,
                            time: { start: textStartTime, end: Date.now() },
                        };

                        await upsertPart({
                            id: textPartId,
                            messageId: assistantMessageId,
                            sessionId,
                            data: flushedTextData,
                        });

                        sessionBus.emit(sessionId, {
                            sessionId,
                            messageId: assistantMessageId,
                            partId: textPartId,
                            type: "part-updated",
                            data: flushedTextData,
                            timestamp: Date.now(),
                        });

                        textPartId = null;
                        assistantText = "";
                    }

                    const toolPartId = randomUUID();
                    const toolData: PartData = {
                        type: "tool",
                        tool: part.toolName,
                        callID: part.toolCallId,
                        state: {
                            status: "running",
                            input: part.input as Record<string, unknown>,
                            time: { start: Date.now() },
                        },
                    };

                    await upsertPart({
                        id: toolPartId,
                        messageId: assistantMessageId,
                        sessionId,
                        data: toolData,
                    });

                    sessionBus.emit(sessionId, {
                        sessionId,
                        messageId: assistantMessageId,
                        partId: toolPartId,
                        type: "part-created",
                        data: toolData,
                        timestamp: Date.now(),
                    });
                    break;
                }

                case "tool-result": {
                    console.log(
                        `[Tool result]: ${part.toolName}`,
                        JSON.stringify(part.output, null, 2),
                    );

                    const existingParts = await listPartsByMessageId(assistantMessageId);
                    const matchingPart = existingParts.find(
                        (p) =>
                            p.data.type === "tool" &&
                            p.data.callID === part.toolCallId,
                    );

                    if (matchingPart && matchingPart.data.type === "tool") {
                        const startTs =
                            matchingPart.data.state.status === "running"
                                ? matchingPart.data.state.time.start
                                : Date.now();

                        const updatedData: PartData = {
                            type: "tool",
                            tool: part.toolName,
                            callID: part.toolCallId,
                            state: {
                                status: "completed",
                                input: matchingPart.data.state.input,
                                output: JSON.stringify(part.output),
                                time: { start: startTs, end: Date.now() },
                            },
                        };

                        await upsertPart({
                            id: matchingPart.id,
                            messageId: assistantMessageId,
                            sessionId,
                            data: updatedData,
                        });

                        sessionBus.emit(sessionId, {
                            sessionId,
                            messageId: assistantMessageId,
                            partId: matchingPart.id,
                            type: "part-updated",
                            data: updatedData,
                            timestamp: Date.now(),
                        });
                    }
                    break;
                }

                case "error": {
                    const errorMessage = serializeError(part.error);
                    console.error("[Error]:", part.error);

                    const errorPartId = randomUUID();
                    const errorData: PartData = {
                        type: "error",
                        error: errorMessage,
                        time: { created: Date.now() },
                    };

                    await upsertPart({
                        id: errorPartId,
                        messageId: assistantMessageId,
                        sessionId,
                        data: errorData,
                    });

                    sessionBus.emit(sessionId, {
                        sessionId,
                        messageId: assistantMessageId,
                        partId: errorPartId,
                        type: "part-created",
                        data: errorData,
                        timestamp: Date.now(),
                    });
                    break;
                }
            }
        }

        console.log();

        if (textPartId && assistantText.trim().length > 0) {
            await upsertPart({
                id: textPartId,
                messageId: assistantMessageId,
                sessionId,
                data: {
                    type: "text",
                    text: assistantText,
                    time: { start: textStartTime, end: Date.now() },
                },
            });

            sessionBus.emit(sessionId, {
                sessionId,
                messageId: assistantMessageId,
                partId: textPartId,
                type: "part-updated",
                data: {
                    type: "text",
                    text: assistantText,
                    time: { start: textStartTime, end: Date.now() },
                },
                timestamp: Date.now(),
            });
        }

        const finalStatus = abortSignal.aborted ? "cancelled" : "completed";

        await upsertMessage({
            id: assistantMessageId,
            sessionId,
            data: {
                role: "assistant",
                time: { created: startTime, completed: Date.now() },
                model: "claude-sonnet-4-5",
                finish: finalStatus,
            },
        });

        sessionBus.emit(sessionId, {
            sessionId,
            messageId: assistantMessageId,
            type: "message-updated",
            data: { finish: finalStatus },
            timestamp: Date.now(),
        });

        if (abortSignal.aborted) {
            sessionBus.emit(sessionId, {
                sessionId,
                type: "cancelled",
                data: { runId },
                timestamp: Date.now(),
            });
        }

        sessionBus.emit(sessionId, {
            sessionId,
            type: "status-change",
            data: { status: finalStatus, runId },
            timestamp: Date.now(),
        });
    } catch (error) {
        const errorMessage = serializeError(error);
        console.error("[Agent failed]:", error);

        const errorPartId = randomUUID();
        const errorData: PartData = {
            type: "error",
            error: errorMessage,
            fatal: true,
            time: { created: Date.now() },
        };

        await upsertPart({
            id: errorPartId,
            messageId: assistantMessageId,
            sessionId,
            data: errorData,
        });

        await upsertMessage({
            id: assistantMessageId,
            sessionId,
            data: {
                role: "assistant",
                time: { created: startTime, completed: Date.now() },
                model: "claude-sonnet-4-5",
                finish: "failed",
                error: errorMessage,
            },
        });

        sessionBus.emit(sessionId, {
            sessionId,
            messageId: assistantMessageId,
            partId: errorPartId,
            type: "part-created",
            data: errorData,
            timestamp: Date.now(),
        });

        sessionBus.emit(sessionId, {
            sessionId,
            type: "status-change",
            data: { status: "failed", runId, error: errorMessage },
            timestamp: Date.now(),
        });
    } finally {
        sessionBus.finishRun(sessionId);
    }
}

export function cancelSession(sessionId: string): boolean {
    return sessionBus.cancelRun(sessionId);
}
