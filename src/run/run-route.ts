import type { Context } from "hono";
import { sendMessage, cancelSession } from "./service";
import {
    listSessions,
    getSessionWithMessages,
} from "../db/db";

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export async function handleSendMessage(c: Context) {
    const sessionId = c.req.param("sessionId");

    let body: { content?: string; windowSize?: number };
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: "Request body must be valid JSON" }, 400);
    }

    if (!isNonEmptyString(body.content)) {
        return c.json(
            { error: "`content` is required and must be a non-empty string" },
            400,
        );
    }

    if (body.windowSize !== undefined && !isPositiveNumber(body.windowSize)) {
        return c.json(
            { error: "`windowSize` must be a positive number when provided" },
            400,
        );
    }

    try {
        const result = await sendMessage({
            content: body.content.trim(),
            sessionId: sessionId || undefined,
            windowSize: body.windowSize,
        });

        return c.json(
            {
                ok: true,
                sessionId: result.sessionId,
                userMessageId: result.userMessageId,
                streamUrl: `/sessions/${result.sessionId}/stream`,
            },
            202,
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to send message";
        console.error("[Route error]:", error);
        return c.json({ error: message }, 500);
    }
}

export async function handleCreateSession(c: Context) {
    let body: { content?: string; windowSize?: number };
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: "Request body must be valid JSON" }, 400);
    }

    if (!isNonEmptyString(body.content)) {
        return c.json(
            { error: "`content` is required and must be a non-empty string" },
            400,
        );
    }

    try {
        const result = await sendMessage({
            content: body.content.trim(),
            windowSize: body.windowSize,
        });

        return c.json(
            {
                ok: true,
                sessionId: result.sessionId,
                userMessageId: result.userMessageId,
                streamUrl: `/sessions/${result.sessionId}/stream`,
            },
            201,
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to create session";
        console.error("[Route error]:", error);
        return c.json({ error: message }, 500);
    }
}

export async function handleListSessions(c: Context) {
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(Number(limitParam) || 50, 200) : 50;

    const sessions = await listSessions(limit);
    return c.json({ sessions });
}

export async function handleGetSession(c: Context) {
    const sessionId = c.req.param("sessionId");
    if (!sessionId) {
        return c.json({ error: "Missing sessionId" }, 400);
    }

    const result = await getSessionWithMessages(sessionId);
    if (!result) {
        return c.json({ error: "Session not found" }, 404);
    }

    return c.json(result);
}

export async function handleListMessages(c: Context) {
    const sessionId = c.req.param("sessionId");
    if (!sessionId) {
        return c.json({ error: "Missing sessionId" }, 400);
    }

    const result = await getSessionWithMessages(sessionId);
    if (!result) {
        return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ messages: result.messages, parts: result.parts });
}

export async function handleCancelSession(c: Context) {
    const sessionId = c.req.param("sessionId");
    if (!sessionId) {
        return c.json({ error: "Missing sessionId" }, 400);
    }

    const cancelled = cancelSession(sessionId);
    return c.json({ ok: true, cancelled });
}
