import { defineConfig } from "drizzle-kit";
import { resolve } from "node:path";

export default defineConfig({
  schema: resolve(process.cwd(), "src/db/schema.ts"),
  out: resolve(process.cwd(), "drizzle"),
  dialect: "sqlite",
  dbCredentials: {
    url: resolve(process.cwd(), "data", "agent.sqlite"),
  },
  verbose: true,
  strict: true,
});
