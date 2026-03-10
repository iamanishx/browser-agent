import { EventEmitter } from "events";

export type SessionEventType =
    | "message-created"
    | "message-updated"
    | "part-created"
    | "part-updated"
    | "part-delta"
    | "status-change"
    | "cancelled";

export type SessionEvent = {
    sessionId: string;
    messageId?: string;
    partId?: string;
    type: SessionEventType;
    data: unknown;
    timestamp: number;
};

export type ActiveRun = {
    runId: string;
    sessionId: string;
    status: "running" | "cancelling";
    abortController: AbortController;
    startedAt: number;
};

class SessionEventBus {
    private emitter = new EventEmitter();
    private activeRuns = new Map<string, ActiveRun>();

    constructor() {
        this.emitter.setMaxListeners(200);
    }

    emit(sessionId: string, event: SessionEvent): void {
        this.emitter.emit(`session:${sessionId}`, event);
    }

    subscribe(
        sessionId: string,
        handler: (event: SessionEvent) => void,
    ): () => void {
        const key = `session:${sessionId}`;
        this.emitter.on(key, handler);
        return () => {
            this.emitter.off(key, handler);
        };
    }

    startRun(sessionId: string, runId: string): AbortController {
        const existing = this.activeRuns.get(sessionId);
        if (existing && existing.status === "running") {
            existing.abortController.abort();
            this.activeRuns.delete(sessionId);
        }

        const abortController = new AbortController();
        this.activeRuns.set(sessionId, {
            runId,
            sessionId,
            status: "running",
            abortController,
            startedAt: Date.now(),
        });

        return abortController;
    }

    cancelRun(sessionId: string): boolean {
        const run = this.activeRuns.get(sessionId);
        if (!run || run.status !== "running") return false;

        run.status = "cancelling";
        run.abortController.abort();
        return true;
    }

    finishRun(sessionId: string): void {
        this.activeRuns.delete(sessionId);
    }

    getActiveRun(sessionId: string): ActiveRun | undefined {
        return this.activeRuns.get(sessionId);
    }

    isRunning(sessionId: string): boolean {
        const run = this.activeRuns.get(sessionId);
        return run?.status === "running";
    }
}

export const sessionBus = new SessionEventBus();
