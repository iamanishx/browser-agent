import { Database } from "bun:sqlite";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";
import type {
    Message,
    MessageRole,
    Run,
    RunEvent,
    RunEventType,
    RunStatus,
    Session,
    SessionStatus,
} from "./schema";

export type SessionRecord = Session;
export type MessageRecord = Message;
export type RunRecord = Run;
export type RunEventRecord = RunEvent;

export type HydratedRunEventRecord = RunEvent & {
    payload: string;
};

export type CreateSessionInput = {
    id: string;
    title?: string | null;
    status?: SessionStatus;
};

export type InsertMessageInput = {
    id: string;
    sessionId: string;
    role: MessageRole;
    content: string;
    metadata?: unknown;
};

export type CreateRunInput = {
    id: string;
    sessionId: string;
    prompt: string;
    status?: RunStatus;
};

export type InsertRunEventInput = {
    runId: string;
    eventType: RunEventType;
    data: unknown;
};

const DB_PATH = resolve(process.cwd(), "data", "agent.sqlite");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const sqlite = new Database(DB_PATH, { create: true });

sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA synchronous = NORMAL;");
sqlite.run("PRAGMA foreign_keys = ON;");
sqlite.run("PRAGMA busy_timeout = 5000;");
sqlite.run("PRAGMA temp_store = MEMORY;");

export const db = drizzle(sqlite, { schema });
export type AppDb = typeof db;
export type AppTransaction = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

function nowIso(): string {
    return new Date().toISOString();
}

function serializeJson(value: unknown): string {
    return JSON.stringify(value ?? null);
}

function parseJson<T>(value: string | null): T | null {
    if (!value) return null;
    return JSON.parse(value) as T;
}

export function getDb(): AppDb {
    return db;
}

export function closeDatabase() {
    sqlite.close(false);
}

export async function transaction<T>(
    fn: (tx: AppTransaction) => Promise<T> | T,
): Promise<T> {
    return db.transaction(async (tx) => fn(tx));
}

export async function createSession(
    input: CreateSessionInput,
): Promise<SessionRecord> {
    const timestamp = nowIso();

    await db.insert(schema.sessions).values({
        id: input.id,
        title: input.title ?? null,
        status: input.status ?? "active",
        createdAt: timestamp,
        updatedAt: timestamp,
    });

    return (await getSessionById(input.id))!;
}

export async function createSessionIfMissing(
    input: CreateSessionInput,
): Promise<SessionRecord> {
    const existing = await getSessionById(input.id);
    if (existing) return existing;
    return createSession(input);
}

export async function getSessionById(
    sessionId: string,
): Promise<SessionRecord | null> {
    const row = await db.query.sessions.findFirst({
        where: eq(schema.sessions.id, sessionId),
    });

    return row ?? null;
}

export async function touchSession(sessionId: string): Promise<void> {
    await db
        .update(schema.sessions)
        .set({ updatedAt: nowIso() })
        .where(eq(schema.sessions.id, sessionId));
}

export async function listSessions(limit = 50): Promise<SessionRecord[]> {
    return db.query.sessions.findMany({
        orderBy: [desc(schema.sessions.updatedAt)],
        limit,
    });
}

export async function insertMessage(
    input: InsertMessageInput,
): Promise<MessageRecord> {
    const createdAt = nowIso();
    const metadata =
        input.metadata === undefined ? null : serializeJson(input.metadata);

    await db.insert(schema.messages).values({
        id: input.id,
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        metadata,
        createdAt,
    });

    await touchSession(input.sessionId);

    return (await getMessageById(input.id))!;
}

export async function getMessageById(
    messageId: string,
): Promise<MessageRecord | null> {
    const row = await db.query.messages.findFirst({
        where: eq(schema.messages.id, messageId),
    });

    return row ?? null;
}

export async function listMessagesBySessionId(
    sessionId: string,
    limit = 50,
): Promise<MessageRecord[]> {
    return db.query.messages.findMany({
        where: eq(schema.messages.sessionId, sessionId),
        orderBy: [desc(schema.messages.createdAt)],
        limit,
    });
}

export async function getSlidingWindowMessages(
    sessionId: string,
    limit = 12,
): Promise<MessageRecord[]> {
    const rows = await listMessagesBySessionId(sessionId, limit);
    return rows.reverse();
}

export async function createRunRecord(
    input: CreateRunInput,
): Promise<RunRecord> {
    const timestamp = nowIso();

    await db.insert(schema.runs).values({
        id: input.id,
        sessionId: input.sessionId,
        status: input.status ?? "queued",
        prompt: input.prompt,
        error: null,
        startedAt: null,
        completedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
    });

    await touchSession(input.sessionId);

    return (await getRunById(input.id))!;
}

export async function getRunById(runId: string): Promise<RunRecord | null> {
    const row = await db.query.runs.findFirst({
        where: eq(schema.runs.id, runId),
    });

    return row ?? null;
}

export async function listRunsBySessionId(
    sessionId: string,
    limit = 50,
): Promise<RunRecord[]> {
    return db.query.runs.findMany({
        where: eq(schema.runs.sessionId, sessionId),
        orderBy: [desc(schema.runs.createdAt)],
        limit,
    });
}

export async function markRunStarted(runId: string): Promise<void> {
    const timestamp = nowIso();

    await db
        .update(schema.runs)
        .set({
            status: "running",
            startedAt: timestamp,
            updatedAt: timestamp,
        })
        .where(eq(schema.runs.id, runId));
}

export async function markRunCompleted(runId: string): Promise<void> {
    const timestamp = nowIso();

    await db
        .update(schema.runs)
        .set({
            status: "completed",
            completedAt: timestamp,
            updatedAt: timestamp,
        })
        .where(eq(schema.runs.id, runId));
}

export async function markRunFailed(
    runId: string,
    error: unknown,
): Promise<void> {
    const timestamp = nowIso();
    const message = error instanceof Error ? error.message : String(error);

    await db
        .update(schema.runs)
        .set({
            status: "failed",
            error: message,
            completedAt: timestamp,
            updatedAt: timestamp,
        })
        .where(eq(schema.runs.id, runId));
}

export async function markRunCancelled(runId: string): Promise<void> {
    const timestamp = nowIso();

    await db
        .update(schema.runs)
        .set({
            status: "cancelled",
            completedAt: timestamp,
            updatedAt: timestamp,
        })
        .where(eq(schema.runs.id, runId));
}

export async function insertRunEvent(
    input: InsertRunEventInput,
): Promise<RunEventRecord> {
    const nextSequenceRow = await db
        .select({
            nextSequence: sql<number>`coalesce(max(${schema.runEvents.sequence}), 0) + 1`,
        })
        .from(schema.runEvents)
        .where(eq(schema.runEvents.runId, input.runId));

    const sequence = nextSequenceRow[0]?.nextSequence ?? 1;
    const createdAt = nowIso();

    await db.insert(schema.runEvents).values({
        runId: input.runId,
        eventType: input.eventType,
        eventData: serializeJson(input.data),
        sequence,
        createdAt,
    });

    const row = await db.query.runEvents.findFirst({
        where: and(
            eq(schema.runEvents.runId, input.runId),
            eq(schema.runEvents.sequence, sequence),
        ),
    });

    return row!;
}

export async function listRunEventsByRunId(
    runId: string,
): Promise<RunEventRecord[]> {
    return db.query.runEvents.findMany({
        where: eq(schema.runEvents.runId, runId),
        orderBy: [schema.runEvents.sequence],
    });
}

export async function getRunEventsAfterId(
    runId: string,
    afterSequence: number,
): Promise<HydratedRunEventRecord[]> {
    const rows = await db.query.runEvents.findMany({
        where: and(
            eq(schema.runEvents.runId, runId),
            gt(schema.runEvents.sequence, afterSequence),
        ),
        orderBy: [schema.runEvents.sequence],
    });

    return rows.map((event) => ({
        ...event,
        payload: event.eventData,
    }));
}

export async function getRunEventPayloads(runId: string): Promise<
    Array<{
        id: number;
        sequence: number;
        type: RunEventType;
        data: unknown;
        createdAt: string;
    }>
> {
    const rows = await listRunEventsByRunId(runId);

    return rows.map((event) => ({
        id: event.id,
        sequence: event.sequence,
        type: event.eventType,
        data: parseJson(event.eventData),
        createdAt: event.createdAt,
    }));
}

export function isRunTerminalStatus(status: RunStatus): boolean {
    return (
        status === "completed" || status === "failed" || status === "cancelled"
    );
}

export async function waitForRunEvents(timeoutMs = 500): Promise<void> {
    await Bun.sleep(timeoutMs);
}

export { DB_PATH };

export type { MessageRole, RunEventType, RunStatus, SessionStatus };
