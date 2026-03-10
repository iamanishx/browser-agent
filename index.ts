import { Hono } from "hono";
import { runMigrations } from "./src/db/migrate";
import {
    handleCreateSession,
    handleListSessions,
    handleGetSession,
    handleSendMessage,
    handleListMessages,
    handleCancelSession,
} from "./src/run/run-route";
import { handleSessionStream } from "./src/sse";

runMigrations();

const app = new Hono();

app.post("/sessions", handleCreateSession);
app.get("/sessions", handleListSessions);
app.get("/sessions/:sessionId", handleGetSession);
app.post("/sessions/:sessionId/messages", handleSendMessage);
app.get("/sessions/:sessionId/messages", handleListMessages);
app.get("/sessions/:sessionId/stream", handleSessionStream);
app.post("/sessions/:sessionId/cancel", handleCancelSession);

export default app;
