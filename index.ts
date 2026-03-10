import { Hono } from "hono";
import { cors } from "hono/cors";
import { runMigrations } from "./src/db/migrate";
import {
    handleCreateSession,
    handleListSessions,
    handleGetSession,
    handleSendMessage,
    handleListMessages,
    handleCancelSession,
    handleSubmitInterrupt,
} from "./src/run/run-route";
import { handleSessionStream } from "./src/sse";

runMigrations();

const app = new Hono();

app.use("*", cors());

app.post("/sessions", handleCreateSession);
app.get("/sessions", handleListSessions);
app.get("/sessions/:sessionId", handleGetSession);
app.post("/sessions/:sessionId/messages", handleSendMessage);
app.get("/sessions/:sessionId/messages", handleListMessages);
app.get("/sessions/:sessionId/stream", handleSessionStream);
app.post("/sessions/:sessionId/cancel", handleCancelSession);
app.post("/sessions/:sessionId/interrupt/:requestId", handleSubmitInterrupt);

export default app;
