import type { Context } from "hono";
import { createRun } from "./service";

type RunRequestBody = {
  prompt?: string;
  sessionId?: string;
  windowSize?: number;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export async function handleRun(c: Context) {
  let body: RunRequestBody;

  try {
    body = await c.req.json<RunRequestBody>();
  } catch {
    return c.json(
      {
        error: "Request body must be valid JSON",
      },
      400,
    );
  }

  if (!isNonEmptyString(body.prompt)) {
    return c.json(
      {
        error: "`prompt` is required and must be a non-empty string",
      },
      400,
    );
  }

  if (
    body.sessionId !== undefined &&
    !isNonEmptyString(body.sessionId)
  ) {
    return c.json(
      {
        error: "`sessionId` must be a non-empty string when provided",
      },
      400,
    );
  }

  if (
    body.windowSize !== undefined &&
    !isPositiveNumber(body.windowSize)
  ) {
    return c.json(
      {
        error: "`windowSize` must be a positive number when provided",
      },
      400,
    );
  }

  try {
    const result = await createRun({
      prompt: body.prompt.trim(),
      sessionId: body.sessionId?.trim(),
      windowSize: body.windowSize,
    });

    return c.json(
      {
        ok: true,
        runId: result.runId,
        sessionId: result.sessionId,
        status: result.status,
        streamUrl: `/stream/${result.runId}`,
      },
      202,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create run";

    console.error("[Run route error]:", error);

    return c.json(
      {
        error: message,
      },
      500,
    );
  }
}
