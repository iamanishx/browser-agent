import { Database } from "bun:sqlite";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";
import type {
    Message,
    MessageData,
    Part,
    PartData,
    Session,
    SessionFile,
    SessionStatus,
} from "./schema";

export type SessionRecord = Session;
export type MessageRecord = Message;
export type PartRecord = Part;
export type SessionFileRecord = SessionFile;

export type CreateSessionInput = {
    id: string;
    title?: string | null;
    status?: SessionStatus;
};

export type UpsertMessageInput = {
    id: string;
    sessionId: string;
    data: MessageData;
};

export type UpsertPartInput = {
    id: string;
    messageId: string;
    sessionId: string;
    data: PartData;
};

export type CreateSessionFileInput = {
    id: string;
    sessionId: string;
    originalName: string;
    storedName: string;
    relativePath: string;
    mimeType: string;
    size: number;
    createdAt?: number;
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

function now(): number {
    return Date.now();
}

export function getDb(): AppDb {
    return db;
}

export function closeDatabase() {
    sqlite.close(false);
}

export async function createSession(
    input: CreateSessionInput,
): Promise<SessionRecord> {
    const ts = now();

    await db.insert(schema.sessions).values({
        id: input.id,
        title: input.title ?? null,
        status: input.status ?? "active",
        createdAt: ts,
        updatedAt: ts,
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
        .set({ updatedAt: now() })
        .where(eq(schema.sessions.id, sessionId));
}

export async function listSessions(limit = 50): Promise<SessionRecord[]> {
    return db.query.sessions.findMany({
        orderBy: [desc(schema.sessions.updatedAt)],
        limit,
    });
}

export async function upsertMessage(
    input: UpsertMessageInput,
): Promise<MessageRecord> {
    const ts = now();

    await db
        .insert(schema.messages)
        .values({
            id: input.id,
            sessionId: input.sessionId,
            createdAt: ts,
            updatedAt: ts,
            data: input.data,
        })
        .onConflictDoUpdate({
            target: schema.messages.id,
            set: { data: input.data, updatedAt: ts },
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
    limit = 100,
): Promise<MessageRecord[]> {
    return db.query.messages.findMany({
        where: eq(schema.messages.sessionId, sessionId),
        orderBy: [schema.messages.createdAt],
        limit,
    });
}

export async function upsertPart(input: UpsertPartInput): Promise<PartRecord> {
    const ts = now();

    await db
        .insert(schema.parts)
        .values({
            id: input.id,
            messageId: input.messageId,
            sessionId: input.sessionId,
            createdAt: ts,
            updatedAt: ts,
            data: input.data,
        })
        .onConflictDoUpdate({
            target: schema.parts.id,
            set: { data: input.data, updatedAt: ts },
        });

    return (await getPartById(input.id))!;
}

export async function getPartById(partId: string): Promise<PartRecord | null> {
    const row = await db.query.parts.findFirst({
        where: eq(schema.parts.id, partId),
    });
    return row ?? null;
}

export async function listPartsByMessageId(
    messageId: string,
): Promise<PartRecord[]> {
    return db.query.parts.findMany({
        where: eq(schema.parts.messageId, messageId),
        orderBy: [schema.parts.createdAt],
    });
}

export async function listPartsBySessionId(
    sessionId: string,
): Promise<PartRecord[]> {
    return db.query.parts.findMany({
        where: eq(schema.parts.sessionId, sessionId),
        orderBy: [schema.parts.createdAt],
    });
}

export async function createSessionFile(
    input: CreateSessionFileInput,
): Promise<SessionFileRecord> {
    const createdAt = input.createdAt ?? now();

    await db.insert(schema.sessionFiles).values({
        id: input.id,
        sessionId: input.sessionId,
        originalName: input.originalName,
        storedName: input.storedName,
        relativePath: input.relativePath,
        mimeType: input.mimeType,
        size: input.size,
        createdAt,
    });

    await touchSession(input.sessionId);
    return (await getSessionFileById(input.id))!;
}

export async function getSessionFileById(
    fileId: string,
): Promise<SessionFileRecord | null> {
    const row = await db.query.sessionFiles.findFirst({
        where: eq(schema.sessionFiles.id, fileId),
    });
    return row ?? null;
}

export async function listSessionFilesBySessionId(
    sessionId: string,
): Promise<SessionFileRecord[]> {
    return db.query.sessionFiles.findMany({
        where: eq(schema.sessionFiles.sessionId, sessionId),
        orderBy: [schema.sessionFiles.createdAt],
    });
}

export async function getSessionWithMessages(
    sessionId: string,
): Promise<{
    session: SessionRecord;
    messages: MessageRecord[];
    parts: PartRecord[];
} | null> {
    const session = await getSessionById(sessionId);
    if (!session) return null;

    const messages = await listMessagesBySessionId(sessionId);
    const sessionParts = await listPartsBySessionId(sessionId);

    return { session, messages, parts: sessionParts };
}

export async function getSlidingWindowMessages(
    sessionId: string,
    limit = 12,
): Promise<MessageRecord[]> {
    const rows = await db.query.messages.findMany({
        where: eq(schema.messages.sessionId, sessionId),
        orderBy: [desc(schema.messages.createdAt)],
        limit,
    });
    return rows.reverse();
}

export { DB_PATH };
export type { SessionStatus, MessageData, PartData };
