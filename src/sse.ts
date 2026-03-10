import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
    getSessionById,
    getSessionWithMessages,
} from "./db/db";
import { sessionBus, type SessionEvent } from "./events/event-bus";

function getLastEventId(c: Context): number {
    const headerValue = c.req.header("last-event-id");
    const queryValue = c.req.query("lastEventId");
    const raw = headerValue ?? queryValue ?? "0";
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function streamSession(
    c: Context,
    sessionId: string,
    heartbeatIntervalMs = 15000,
) {
    const session = await getSessionById(sessionId);
    if (!session) {
        return c.json({ error: "Session not found", sessionId }, 404);
    }

    const lastSeen = getLastEventId(c);

    return streamSSE(
        c,
        async (stream) => {
            let closed = false;
            let lastHeartbeatAt = Date.now();
            let eventCounter = lastSeen;

            stream.onAbort(() => {
                closed = true;
            });

            await stream.writeSSE({
                event: "session",
                id: String(eventCounter),
                data: JSON.stringify({
                    sessionId: session.id,
                    status: session.status,
                    title: session.title,
                    createdAt: session.createdAt,
                }),
            });

            const snapshot = await getSessionWithMessages(sessionId);
            if (snapshot && !closed) {
                for (const msg of snapshot.messages) {
                    if (closed) break;
                    eventCounter++;
                    if (eventCounter <= lastSeen) continue;

                    const msgParts = snapshot.parts.filter(
                        (p) => p.messageId === msg.id,
                    );

                    await stream.writeSSE({
                        event: "message",
                        id: String(eventCounter),
                        data: JSON.stringify({
                            id: msg.id,
                            sessionId: msg.sessionId,
                            data: msg.data,
                            parts: msgParts.map((p) => ({
                                id: p.id,
                                data: p.data,
                                createdAt: p.createdAt,
                            })),
                            createdAt: msg.createdAt,
                        }),
                    });
                }
            }

            if (closed) return;

            const unsubscribe = sessionBus.subscribe(
                sessionId,
                async (event: SessionEvent) => {
                    if (closed) return;

                    try {
                        eventCounter++;

                        await stream.writeSSE({
                            event: event.type,
                            id: String(eventCounter),
                            data: JSON.stringify({
                                ...event.data as Record<string, unknown>,
                                messageId: event.messageId,
                                partId: event.partId,
                            }),
                        });

                        lastHeartbeatAt = Date.now();
                    } catch {
                        closed = true;
                    }
                },
            );

            try {
                while (!closed) {
                    const elapsed = Date.now() - lastHeartbeatAt;
                    if (elapsed >= heartbeatIntervalMs) {
                        await stream.writeSSE({
                            event: "heartbeat",
                            id: String(eventCounter),
                            data: JSON.stringify({ sessionId, ts: Date.now() }),
                        });
                        lastHeartbeatAt = Date.now();
                    }
                    await stream.sleep(5000);
                }
            } finally {
                unsubscribe();
            }
        },
        async (err, stream) => {
            console.error(`[SSE] Stream error for session ${sessionId}:`, err);
            await stream.writeSSE({
                event: "error",
                data: JSON.stringify({
                    sessionId,
                    message: err instanceof Error ? err.message : String(err),
                }),
            });
        },
    );
}

export async function handleSessionStream(c: Context) {
    const sessionId = c.req.param("sessionId");
    if (!sessionId) {
        return c.json({ error: "Missing sessionId route parameter" }, 400);
    }
    return streamSession(c, sessionId);
}
