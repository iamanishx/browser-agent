import type { Context } from "hono";
import { sendMessage, cancelSession } from "./service";
import {
    listSessions,
    getSessionWithMessages,
    getSessionById,
} from "../db/db";
import { resolveInterruptRequest } from "../interrupts/interrupt-store";
import { sessionBus } from "../events/event-bus";

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

export async function handleSubmitInterrupt(c: Context) {
    const sessionId = c.req.param("sessionId");
    const requestId = c.req.param("requestId");

    if (!sessionId || !requestId) {
        return c.json({ error: "Missing sessionId or requestId" }, 400);
    }

    const session = await getSessionById(sessionId);
    if (!session) {
        return c.json({ error: "Session not found" }, 404);
    }

    let body: { value?: string };
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: "Request body must be valid JSON" }, 400);
    }

    if (!isNonEmptyString(body.value)) {
        return c.json(
            { error: "`value` is required and must be a non-empty string" },
            400,
        );
    }

    const resolved = resolveInterruptRequest(requestId, body.value);
    if (!resolved) {
        return c.json(
            { error: "No pending interrupt with that ID" },
            404,
        );
    }

    sessionBus.emit(sessionId, {
        sessionId,
        type: "input-resolved",
        data: { requestId },
        timestamp: Date.now(),
    });

    return c.json({ ok: true }, 202);
}
