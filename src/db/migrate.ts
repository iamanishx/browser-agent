import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const DB_PATH = resolve(process.cwd(), "data", "agent.sqlite");
const MIGRATIONS_FOLDER = resolve(process.cwd(), "drizzle");

export type MigrationResult = {
    appliedCount: number;
    migrationsFolder: string;
    dbPath: string;
};

export function runMigrations(): MigrationResult {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    mkdirSync(MIGRATIONS_FOLDER, { recursive: true });

    const sqlite = new Database(DB_PATH, { create: true });

    try {
        sqlite.run("PRAGMA journal_mode = WAL;");
        sqlite.run("PRAGMA synchronous = NORMAL;");
        sqlite.run("PRAGMA foreign_keys = ON;");
        sqlite.run("PRAGMA busy_timeout = 5000;");
        sqlite.run("PRAGMA temp_store = MEMORY;");

        sqlite.run("DROP TABLE IF EXISTS run_events;");
        sqlite.run("DROP TABLE IF EXISTS runs;");

        const db = drizzle({ client: sqlite });

        migrate(db, {
            migrationsFolder: MIGRATIONS_FOLDER,
        });

        const row = sqlite
            .query("SELECT COUNT(*) as count FROM __drizzle_migrations")
            .get() as { count: number } | null;

        return {
            appliedCount: row?.count ?? 0,
            migrationsFolder: MIGRATIONS_FOLDER,
            dbPath: DB_PATH,
        };
    } finally {
        sqlite.close(false);
    }
}
