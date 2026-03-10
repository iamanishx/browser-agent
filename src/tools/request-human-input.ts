import { randomUUID } from "crypto";
import { tool } from "ai";
import { z } from "zod";
import { upsertPart } from "../db/db";
import type { InputRequiredPartData } from "../db/schema";
import { sessionBus } from "../events/event-bus";
import {
    cancelInterruptRequest,
    createInterruptRequest,
} from "../interrupts/interrupt-store";

export type InterruptContext = {
    sessionId: string;
    messageId: string;
    abortSignal: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function makeRequestHumanInputTool(ctx: InterruptContext) {
    return tool({
        description:
            "Pause execution and ask the human for a value. Use this when the website requires OTP, 2FA code, CAPTCHA answer, or any other input that only the human can provide. Returns the value the human entered.",
        inputSchema: z.object({
            prompt: z
                .string()
                .describe(
                    "What to ask the human, e.g. 'Enter the OTP sent to your phone'",
                ),
            inputType: z
                .enum(["otp", "text", "password"])
                .default("otp")
                .describe("Controls the frontend input widget"),
            timeoutMs: z
                .number()
                .optional()
                .describe(
                    "Milliseconds to wait before giving up (default 300000)",
                ),
        }),
        execute: async ({ prompt, inputType, timeoutMs }) => {
            const requestId = randomUUID();
            const partId = randomUUID();
            const now = Date.now();
            const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

            const partData: InputRequiredPartData = {
                type: "input-required",
                requestId,
                prompt,
                inputType,
                status: "pending",
                time: { created: now },
            };

            await upsertPart({
                id: partId,
                messageId: ctx.messageId,
                sessionId: ctx.sessionId,
                data: partData,
            });

            sessionBus.emit(ctx.sessionId, {
                sessionId: ctx.sessionId,
                messageId: ctx.messageId,
                partId,
                type: "input-required",
                data: {
                    requestId,
                    prompt,
                    inputType,
                    partId,
                },
                timestamp: now,
            });

            const valuePromise = createInterruptRequest(requestId);

            const abortPromise = new Promise<never>((_, reject) => {
                if (ctx.abortSignal.aborted) {
                    reject(new Error("run cancelled"));
                    return;
                }
                ctx.abortSignal.addEventListener(
                    "abort",
                    () => reject(new Error("run cancelled")),
                    { once: true },
                );
            });

            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("timed-out")), timeout),
            );

            try {
                const value = await Promise.race([
                    valuePromise,
                    abortPromise,
                    timeoutPromise,
                ]);

                await upsertPart({
                    id: partId,
                    messageId: ctx.messageId,
                    sessionId: ctx.sessionId,
                    data: {
                        ...partData,
                        status: "completed",
                        time: { created: now, resolved: Date.now() },
                    },
                });

                sessionBus.emit(ctx.sessionId, {
                    sessionId: ctx.sessionId,
                    messageId: ctx.messageId,
                    partId,
                    type: "part-updated",
                    data: {
                        ...partData,
                        status: "completed",
                        time: { created: now, resolved: Date.now() },
                    },
                    timestamp: Date.now(),
                });

                return value;
            } catch (err) {
                const reason =
                    err instanceof Error ? err.message : String(err);
                const isCancelled = reason === "run cancelled";
                const finalStatus = isCancelled ? "cancelled" : "timed-out";

                cancelInterruptRequest(requestId, reason);

                await upsertPart({
                    id: partId,
                    messageId: ctx.messageId,
                    sessionId: ctx.sessionId,
                    data: {
                        ...partData,
                        status: finalStatus,
                        time: { created: now, resolved: Date.now() },
                    },
                });

                sessionBus.emit(ctx.sessionId, {
                    sessionId: ctx.sessionId,
                    messageId: ctx.messageId,
                    partId,
                    type: "part-updated",
                    data: {
                        ...partData,
                        status: finalStatus,
                        time: { created: now, resolved: Date.now() },
                    },
                    timestamp: Date.now(),
                });

                if (isCancelled) {
                    throw err;
                }

                return "TIMEOUT";
            }
        },
    });
}
