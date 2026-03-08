import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/sqlite-core";

export const sessionStatusValues = ["active", "archived"] as const;
export const messageRoleValues = [
    "system",
    "user",
    "assistant",
    "tool",
] as const;
export const runStatusValues = [
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
] as const;
export const runEventTypeValues = [
    "run-created",
    "run-started",
    "text-delta",
    "tool-call",
    "tool-result",
    "error",
    "done",
] as const;

export type SessionStatus = (typeof sessionStatusValues)[number];
export type MessageRole = (typeof messageRoleValues)[number];
export type RunStatus = (typeof runStatusValues)[number];
export type RunEventType = (typeof runEventTypeValues)[number];

export const sessions = t.sqliteTable(
    "sessions",
    {
        id: t.text("id").primaryKey(),
        title: t.text("title"),
        status: t
            .text("status")
            .$type<SessionStatus>()
            .notNull()
            .default("active"),
        createdAt: t
            .text("created_at")
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: t
            .text("updated_at")
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => [
        t.check(
            "sessions_status_check",
            sql`${table.status} in ('active', 'archived')`,
        ),
        t.index("sessions_updated_at_idx").on(table.updatedAt),
    ],
);

export const messages = t.sqliteTable(
    "messages",
    {
        id: t.text("id").primaryKey(),
        sessionId: t
            .text("session_id")
            .notNull()
            .references(() => sessions.id, { onDelete: "cascade" }),
        role: t.text("role").$type<MessageRole>().notNull(),
        content: t.text("content").notNull(),
        metadata: t.text("metadata"),
        createdAt: t
            .text("created_at")
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => [
        t.check(
            "messages_role_check",
            sql`${table.role} in ('system', 'user', 'assistant', 'tool')`,
        ),
        t
            .index("messages_session_id_created_at_idx")
            .on(table.sessionId, table.createdAt),
    ],
);

export const runs = t.sqliteTable(
    "runs",
    {
        id: t.text("id").primaryKey(),
        sessionId: t
            .text("session_id")
            .notNull()
            .references(() => sessions.id, { onDelete: "cascade" }),
        status: t.text("status").$type<RunStatus>().notNull().default("queued"),
        prompt: t.text("prompt").notNull(),
        error: t.text("error"),
        startedAt: t.text("started_at"),
        completedAt: t.text("completed_at"),
        createdAt: t
            .text("created_at")
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: t
            .text("updated_at")
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => [
        t.check(
            "runs_status_check",
            sql`${table.status} in ('queued', 'running', 'completed', 'failed', 'cancelled')`,
        ),
        t
            .index("runs_session_id_created_at_idx")
            .on(table.sessionId, table.createdAt),
        t.index("runs_status_idx").on(table.status),
    ],
);

export const runEvents = t.sqliteTable(
    "run_events",
    {
        id: t.integer("id").primaryKey({ autoIncrement: true }),
        runId: t
            .text("run_id")
            .notNull()
            .references(() => runs.id, { onDelete: "cascade" }),
        eventType: t.text("event_type").$type<RunEventType>().notNull(),
        eventData: t.text("event_data").notNull(),
        sequence: t.integer("sequence").notNull(),
        createdAt: t
            .text("created_at")
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => [
        t.check(
            "run_events_event_type_check",
            sql`${table.eventType} in ('run-created', 'run-started', 'text-delta', 'tool-call', 'tool-result', 'error', 'done')`,
        ),
        t
            .uniqueIndex("run_events_run_id_sequence_unique")
            .on(table.runId, table.sequence),
        t
            .index("run_events_run_id_sequence_idx")
            .on(table.runId, table.sequence),
    ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

export type RunEvent = typeof runEvents.$inferSelect;
export type NewRunEvent = typeof runEvents.$inferInsert;
