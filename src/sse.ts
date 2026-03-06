import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { createWebAgent } from "./agent/agents";

export async function createSSEStream(c: Context) {
    return streamSSE(c, async (stream) => {
        stream.onAbort(() => {
            console.log("[SSE] Client disconnected");
        });

        const agent = await createWebAgent();

        const result = await agent.stream({
            prompt: "go merchat.sabpe.com and use the mail: ujsquared@gmail.com and password: password123 and login and then go to the setting page and tell me whats the gstin number",
        });

        let eventId = 0;

            for await (const part of result.fullStream) {
                switch (part.type) {
                  
                    case "text-delta": {
                        process.stdout.write(part.text);
                        await stream.writeSSE({
                            event: "text-delta",
                            data: JSON.stringify({ text: part.text }),
                            id: String(eventId++),
                        });
                        break;
                    }

                    case "tool-call": {
                        const log = {
                            toolName: part.toolName,
                            input: part.input,
                        };
                        console.log(
                            `[Tool call]: ${part.toolName}`,
                            JSON.stringify(part.input, null, 2),
                        );
                        await stream.writeSSE({
                            event: "tool-call",
                            data: JSON.stringify(log),
                            id: String(eventId++),
                        });
                        break;
                    }

                    case "tool-result": {
                        const log = {
                            toolName: part.toolName,
                            output: part.output,
                        };
                        console.log(
                            `[Tool result]: ${part.toolName}`,
                            JSON.stringify(part.output, null, 2),
                        );
                        await stream.writeSSE({
                            event: "tool-result",
                            data: JSON.stringify(log),
                            id: String(eventId++),
                        });
                        break;
                    }

                    case "error": {
                        console.error(`[Error]:`, part.error);
                        await stream.writeSSE({
                            event: "error",
                            data: JSON.stringify({
                                error:
                                    part.error instanceof Error
                                        ? part.error.message
                                        : String(part.error),
                            }),
                            id: String(eventId++),
                        });
                        break;
                    }
                }
            }

            console.log();
            await stream.writeSSE({
                event: "done",
                data: JSON.stringify({ message: "Stream complete" }),
                id: String(eventId++),
            });
        },
        async (err, stream) => {
            console.error("[SSE] Stream error:", err);
            await stream.writeSSE({
                event: "error",
                data: JSON.stringify({ error: err.message }),
            });
        },
    );
}
