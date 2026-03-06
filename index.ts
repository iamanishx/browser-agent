import { Hono } from "hono";
import { createSSEStream } from "./src/sse";

const app = new Hono();

app.get("/stream", (c) => createSSEStream(c));

export default app;
