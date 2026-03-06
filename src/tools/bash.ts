import { z } from "zod";
import { tool } from "ai";
import { resolve } from "path";

const ROOT = "/home/manish/pos-agent";

export const bashTool = tool({
    description: `Execute a shell command. All commands run inside ${ROOT}.`,
    inputSchema: z.object({
        command: z.string().describe("The shell command to execute"),
        cwd: z.string().optional().describe(`Working directory (must be inside ${ROOT})`),
    }),
    execute: async ({ command, cwd }) => {
        const resolvedCwd = resolve(cwd || ROOT);

        if (!resolvedCwd.startsWith(ROOT)) {
            return `Error: cwd "${resolvedCwd}" is outside the allowed directory "${ROOT}"`;
        }

        try {
            const proc = Bun.spawn(["sh", "-c", command], {
                cwd: resolvedCwd,
                stdout: "pipe",
                stderr: "pipe",
            });

            const stdout = await new Response(proc.stdout).text();
            const stderr = await new Response(proc.stderr).text();
            const exitCode = await proc.exited;

            if (exitCode !== 0) {
                return `Command failed (exit code ${exitCode}):\n${stderr || stdout}`;
            }

            return stdout || "(no output)";
        } catch (error: any) {
            return `Error: ${error.message}`;
        }
    },
});
