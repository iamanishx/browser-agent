import { Hono } from "hono";
import { runMigrations } from "./src/db/migrate";
import { handleRun } from "./src/run/run-route";
import { handleRunStream } from "./src/sse";

runMigrations();

const app = new Hono();

app.post("/run", handleRun);
app.get("/stream/:runId", handleRunStream);

export default app;
