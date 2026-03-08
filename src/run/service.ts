import { randomUUID } from "crypto";
import { buildAgentPrompt, createWebAgent } from "../agent/agents";
import {
    createRunRecord,
    createSessionIfMissing,
    getRunById,
    getSlidingWindowMessages,
    insertMessage,
    insertRunEvent,
    markRunCompleted,
    markRunFailed,
    markRunStarted,
    type MessageRecord,
    type RunEventRecord,
    type RunStatus,
} from "../db/db";

export type CreateRunInput = {
    prompt: string;
    sessionId?: string;
    windowSize?: number;
};

export type CreateRunResult = {
    runId: string;
    sessionId: string;
    status: RunStatus;
};

const DEFAULT_WINDOW_SIZE = 15;

function normalizeWindowSize(windowSize?: number): number {
    if (!windowSize || Number.isNaN(windowSize) || windowSize < 1) {
        return DEFAULT_WINDOW_SIZE;
    }

    return Math.floor(windowSize);
}

function serializeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function toPromptHistory(messages: MessageRecord[]) {
    return messages
        .filter(
            (
                message,
            ): message is MessageRecord & {
                role: "system" | "user" | "assistant";
            } =>
                message.role === "system" ||
                message.role === "user" ||
                message.role === "assistant",
        )
        .map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
        }));
}

async function persistEvent(
    runId: string,
    eventType: RunEventRecord["eventType"],
    data: unknown,
): Promise<RunEventRecord> {
    return insertRunEvent({
        runId,
        eventType,
        data,
    });
}

type ExecuteRunInput = {
    runId: string;
    sessionId: string;
    originalPrompt: string;
    promptWithHistory: string;
};

export async function createRun(
    input: CreateRunInput,
): Promise<CreateRunResult> {
    const sessionId = input.sessionId ?? randomUUID();
    const runId = randomUUID();
    const windowSize = normalizeWindowSize(input.windowSize);

    await createSessionIfMissing({ id: sessionId });

    const priorMessages = await getSlidingWindowMessages(sessionId, windowSize);

    await insertMessage({
        id: randomUUID(),
        sessionId,
        role: "user",
        content: input.prompt,
    });

    await createRunRecord({
        id: runId,
        sessionId,
        prompt: input.prompt,
        status: "queued",
    });

    await persistEvent(runId, "run-created", {
        runId,
        sessionId,
        prompt: input.prompt,
        windowSize,
    });

    const promptWithHistory = buildAgentPrompt({
        userPrompt: input.prompt,
        history: toPromptHistory(priorMessages),
        maxHistoryMessages: windowSize,
    });

    queueMicrotask(() => {
        void executeRun({
            runId,
            sessionId,
            originalPrompt: input.prompt,
            promptWithHistory,
        });
    });

    return {
        runId,
        sessionId,
        status: "queued",
    };
}

export async function executeRun(input: ExecuteRunInput): Promise<void> {
    let assistantText = "";

    try {
        await markRunStarted(input.runId);

        await persistEvent(input.runId, "run-started", {
            runId: input.runId,
            sessionId: input.sessionId,
            prompt: input.originalPrompt,
        });

        const agent = await createWebAgent();
        const result = await agent.stream({
            prompt: input.promptWithHistory,
        });

        for await (const part of result.fullStream) {
            switch (part.type) {
                case "text-delta": {
                    assistantText += part.text;
                    process.stdout.write(part.text);

                    await persistEvent(input.runId, "text-delta", {
                        text: part.text,
                    });
                    break;
                }

                case "tool-call": {
                    console.log(
                        `[Tool call]: ${part.toolName}`,
                        JSON.stringify(part.input, null, 2),
                    );

                    await persistEvent(input.runId, "tool-call", {
                        toolName: part.toolName,
                        input: part.input,
                    });
                    break;
                }

                case "tool-result": {
                    console.log(
                        `[Tool result]: ${part.toolName}`,
                        JSON.stringify(part.output, null, 2),
                    );

                    await persistEvent(input.runId, "tool-result", {
                        toolName: part.toolName,
                        output: part.output,
                    });
                    break;
                }

                case "error": {
                    const errorMessage = serializeError(part.error);
                    console.error("[Error]:", part.error);

                    await persistEvent(input.runId, "error", {
                        error: errorMessage,
                    });
                    break;
                }
            }
        }

        console.log();

        if (assistantText.trim().length > 0) {
            await insertMessage({
                id: randomUUID(),
                sessionId: input.sessionId,
                role: "assistant",
                content: assistantText,
            });
        }

        await markRunCompleted(input.runId);

        await persistEvent(input.runId, "done", {
            message: "Stream complete",
        });
    } catch (error) {
        const errorMessage = serializeError(error);
        console.error("[Run failed]:", error);

        await markRunFailed(input.runId, errorMessage);

        await persistEvent(input.runId, "error", {
            error: errorMessage,
        });
    }
}

export function isTerminalRunStatus(status: RunStatus): boolean {
    return (
        status === "completed" || status === "failed" || status === "cancelled"
    );
}

export async function getRunOrThrow(runId: string) {
    const run = await getRunById(runId);

    if (!run) {
        throw new Error(`Run not found: ${runId}`);
    }

    return run;
}
