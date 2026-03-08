import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
    getRunById,
    getRunEventPayloads,
    listRunEventsAfter,
} from "./run/store";

type StreamOptions = {
    pollIntervalMs?: number;
    heartbeatIntervalMs?: number;
};

type StreamEvent = {
    id: number;
    type: string;
    data: unknown;
    createdAt: string;
};

function getLastEventId(c: Context): number {
    const headerValue = c.req.header("last-event-id");
    const queryValue = c.req.query("lastEventId");
    const raw = headerValue ?? queryValue ?? "0";
    const parsed = Number(raw);

    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function isTerminalStatus(status: string): boolean {
    return (
        status === "completed" || status === "failed" || status === "cancelled"
    );
}

function toStreamEvent(row: {
    id: number;
    eventType: string;
    eventData: string;
    createdAt: string;
}): StreamEvent {
    return {
        id: row.id,
        type: row.eventType,
        data: JSON.parse(row.eventData),
        createdAt: row.createdAt,
    };
}

async function writeEvents(
    stream: {
        writeSSE: (event: {
            id?: string;
            event?: string;
            data: string;
        }) => Promise<void>;
    },
    events: StreamEvent[],
) {
    for (const event of events) {
        await stream.writeSSE({
            id: String(event.id),
            event: event.type,
            data: JSON.stringify(event.data),
        });
    }
}

async function loadEventsAfter(
    runId: string,
    cursor: number,
): Promise<StreamEvent[]> {
    const rows = await listRunEventsAfter(runId, cursor);
    return rows.map(toStreamEvent);
}

export async function streamRunEvents(
    c: Context,
    runId: string,
    options: StreamOptions = {},
) {
    const pollIntervalMs = options.pollIntervalMs ?? 1000;
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15000;
    const lastSeenEventId = getLastEventId(c);

    const run = await getRunById(runId);

    if (!run) {
        return c.json(
            {
                error: "Run not found",
                runId,
            },
            404,
        );
    }

    return streamSSE(
        c,
        async (stream) => {
            let cursor = lastSeenEventId;
            let closed = false;
            let lastHeartbeatAt = Date.now();

            stream.onAbort(() => {
                closed = true;
                console.log(`[SSE] Client disconnected from run ${runId}`);
            });

            await stream.writeSSE({
                event: "run",
                id: String(cursor),
                data: JSON.stringify({
                    runId: run.id,
                    sessionId: run.sessionId,
                    status: run.status,
                    prompt: run.prompt,
                    error: run.error,
                    startedAt: run.startedAt,
                    completedAt: run.completedAt,
                    createdAt: run.createdAt,
                }),
            });

            const replayEvents = (await getRunEventPayloads(runId)).filter(
                (event) => event.id > cursor,
            );

            if (replayEvents.length > 0) {
                await writeEvents(
                    stream,
                    replayEvents.map((event) => ({
                        id: event.id,
                        type: event.type,
                        data: event.data,
                        createdAt: event.createdAt,
                    })),
                );
                cursor = replayEvents[replayEvents.length - 1]!.id;
                lastHeartbeatAt = Date.now();
            }

            while (!closed) {
                const events = await loadEventsAfter(runId, cursor);

                if (events.length > 0) {
                    await writeEvents(stream, events);
                    cursor = events[events.length - 1]!.id;
                    lastHeartbeatAt = Date.now();
                }

                const currentRun = await getRunById(runId);

                if (!currentRun) {
                    await stream.writeSSE({
                        event: "error",
                        id: String(cursor),
                        data: JSON.stringify({
                            message: "Run disappeared while streaming",
                            runId,
                        }),
                    });
                    break;
                }

                if (isTerminalStatus(currentRun.status)) {
                    const trailingEvents = await loadEventsAfter(runId, cursor);

                    if (trailingEvents.length > 0) {
                        await writeEvents(stream, trailingEvents);
                        cursor = trailingEvents[trailingEvents.length - 1]!.id;
                    }

                    await stream.writeSSE({
                        event: "run-status",
                        id: String(cursor),
                        data: JSON.stringify({
                            runId: currentRun.id,
                            status: currentRun.status,
                            error: currentRun.error,
                            completedAt: currentRun.completedAt,
                        }),
                    });

                    break;
                }

                const now = Date.now();

                if (now - lastHeartbeatAt >= heartbeatIntervalMs) {
                    await stream.writeSSE({
                        event: "heartbeat",
                        id: String(cursor),
                        data: JSON.stringify({
                            runId,
                            ts: new Date(now).toISOString(),
                        }),
                    });
                    lastHeartbeatAt = now;
                }

                await stream.sleep(pollIntervalMs);
            }
        },
        async (err, stream) => {
            console.error(`[SSE] Stream error for run ${runId}:`, err);

            await stream.writeSSE({
                event: "error",
                data: JSON.stringify({
                    runId,
                    message: err instanceof Error ? err.message : String(err),
                }),
            });
        },
    );
}

export async function handleRunStream(c: Context) {
    const runId = c.req.param("runId");

    if (!runId) {
        return c.json(
            {
                error: "Missing runId route parameter",
            },
            400,
        );
    }

    return streamRunEvents(c, runId);
}
