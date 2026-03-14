import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/sqlite-core";

export const sessionStatusValues = ["active", "archived"] as const;
export const messageRoleValues = ["user", "assistant"] as const;
export const partTypeValues = [
    "text",
    "reasoning",
    "tool",
    "error",
    "step-start",
    "step-finish",
    "input-required",
] as const;

export type SessionStatus = (typeof sessionStatusValues)[number];
export type MessageRole = (typeof messageRoleValues)[number];
export type PartType = (typeof partTypeValues)[number];

export type SessionFileData = {
    id: string;
    sessionId: string;
    originalName: string;
    storedName: string;
    relativePath: string;
    mimeType: string;
    size: number;
    createdAt: number;
};

export type UserMessageData = {
    role: "user";
    content: string;
    time: { created: number };
};

export type AssistantMessageData = {
    role: "assistant";
    time: { created: number; completed?: number };
    model: string;
    tokens?: {
        input: number;
        output: number;
    };
    cost?: number;
    finish?: string;
    error?: string;
};

export type MessageData = UserMessageData | AssistantMessageData;

export type TextPartData = {
    type: "text";
    text: string;
    time: { start: number; end?: number };
};

export type ReasoningPartData = {
    type: "reasoning";
    text: string;
    time: { start: number; end?: number };
};

export type ToolPartState =
    | {
          status: "pending";
          input: Record<string, unknown>;
      }
    | {
          status: "running";
          input: Record<string, unknown>;
          time: { start: number };
      }
    | {
          status: "completed";
          input: Record<string, unknown>;
          output: string;
          time: { start: number; end: number };
      }
    | {
          status: "error";
          input: Record<string, unknown>;
          error: string;
          time: { start: number; end: number };
      };

export type ToolPartData = {
    type: "tool";
    tool: string;
    callID: string;
    state: ToolPartState;
};

export type ErrorPartData = {
    type: "error";
    error: string;
    fatal?: boolean;
    time: { created: number };
};

export type StepStartPartData = {
    type: "step-start";
    time: { start: number };
};

export type StepFinishPartData = {
    type: "step-finish";
    reason: string;
    time: { start: number; end: number };
    tokens?: {
        input: number;
        output: number;
    };
};

export type InputRequiredPartData = {
    type: "input-required";
    requestId: string;
    prompt: string;
    inputType: "otp" | "text" | "password";
    status: "pending" | "completed" | "cancelled" | "timed-out";
    time: { created: number; resolved?: number };
};

export type PartData =
    | TextPartData
    | ReasoningPartData
    | ToolPartData
    | ErrorPartData
    | StepStartPartData
    | StepFinishPartData
    | InputRequiredPartData;

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
        createdAt: t.integer("created_at").notNull(),
        updatedAt: t.integer("updated_at").notNull(),
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
        createdAt: t.integer("created_at").notNull(),
        updatedAt: t.integer("updated_at").notNull(),
        data: t.text("data", { mode: "json" }).notNull().$type<MessageData>(),
    },
    (table) => [t.index("messages_session_idx").on(table.sessionId)],
);

export const parts = t.sqliteTable(
    "parts",
    {
        id: t.text("id").primaryKey(),
        messageId: t
            .text("message_id")
            .notNull()
            .references(() => messages.id, { onDelete: "cascade" }),
        sessionId: t.text("session_id").notNull(),
        createdAt: t.integer("created_at").notNull(),
        updatedAt: t.integer("updated_at").notNull(),
        data: t.text("data", { mode: "json" }).notNull().$type<PartData>(),
    },
    (table) => [
        t.index("parts_message_idx").on(table.messageId),
        t.index("parts_session_idx").on(table.sessionId),
    ],
);

export const sessionFiles = t.sqliteTable(
    "session_files",
    {
        id: t.text("id").primaryKey(),
        sessionId: t
            .text("session_id")
            .notNull()
            .references(() => sessions.id, { onDelete: "cascade" }),
        originalName: t.text("original_name").notNull(),
        storedName: t.text("stored_name").notNull(),
        relativePath: t.text("relative_path").notNull(),
        mimeType: t.text("mime_type").notNull(),
        size: t.integer("size").notNull(),
        createdAt: t.integer("created_at").notNull(),
    },
    (table) => [
        t.index("session_files_session_idx").on(table.sessionId),
        t.index("session_files_created_at_idx").on(table.createdAt),
    ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Part = typeof parts.$inferSelect;
export type NewPart = typeof parts.$inferInsert;

export type SessionFile = typeof sessionFiles.$inferSelect;
export type NewSessionFile = typeof sessionFiles.$inferInsert;
