import { ToolLoopAgent, stepCountIs, type ToolSet } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromIni } from "@aws-sdk/credential-providers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bashTool } from "../tools/bash";
import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
    makeRequestHumanInputTool,
    type InterruptContext,
} from "../tools/request-human-input";

export type PersistedMessageRole = "system" | "user" | "assistant";

export interface PersistedMessage {
    role: PersistedMessageRole;
    content: string;
    createdAt?: string;
}

export interface BuildPromptOptions {
    userPrompt: string;
    history?: PersistedMessage[];
    maxHistoryMessages?: number;
}

const bedrock = createAmazonBedrock({
    region: "us-east-1",
    credentialProvider: fromIni({ profile: "clickpe" }),
});

function loadSkill(): string {
    const skillPath = resolve(process.cwd(), "SKILL.md");
    try {
        const raw = readFileSync(skillPath, "utf-8");
        const body = raw.replace(/^---[\s\S]*?---\n/, "").trim();
        return body;
    } catch {
        return "";
    }
}

const SKILL_CONTENT = loadSkill();

const BASE_INSTRUCTIONS = [
    "You are a browser automation agent.",
    "",
    "Use the bash tool to run agent-browser CLI commands.",
    "Always re-snapshot after any navigation or DOM change.",
    "When a site requires OTP, 2FA, or any human-only input, call the request_human_input tool — do NOT guess or skip it.",
    "",
    SKILL_CONTENT,
]
    .join("\n")
    .trim();

function normalizeContent(value: string): string {
    return value.replace(/\r\n/g, "\n").trim();
}

function clampHistory(
    history: PersistedMessage[],
    maxHistoryMessages: number,
): PersistedMessage[] {
    if (maxHistoryMessages <= 0) {
        return [];
    }

    if (history.length <= maxHistoryMessages) {
        return history;
    }

    return history.slice(history.length - maxHistoryMessages);
}

export function buildAgentPrompt({
    userPrompt,
    history = [],
    maxHistoryMessages = 12,
}: BuildPromptOptions): string {
    const trimmedPrompt = normalizeContent(userPrompt);
    const windowedHistory = clampHistory(history, maxHistoryMessages)
        .map((message) => ({
            ...message,
            content: normalizeContent(message.content),
        }))
        .filter((message) => message.content.length > 0);

    if (windowedHistory.length === 0) {
        return trimmedPrompt;
    }

    const historyBlock = windowedHistory
        .map((message, index) => {
            const timestamp = message.createdAt
                ? ` @ ${message.createdAt}`
                : "";
            return [
                `[${index + 1}] ${message.role.toUpperCase()}${timestamp}`,
                message.content,
            ].join("\n");
        })
        .join("\n\n");

    return [
        "Conversation history (oldest to newest):",
        historyBlock,
        "",
        "New user message:",
        trimmedPrompt,
    ].join("\n");
}

export async function createWebAgent(interruptCtx?: InterruptContext) {
    const fsClient = await createMCPClient({
        transport: new StdioClientTransport({
            command: "npx",
            args: [
                "-y",
                "@modelcontextprotocol/server-filesystem",
                process.cwd(),
            ],
            stderr: "ignore",
        }),
    });

    const tools: ToolSet = {
        bashTool,
        ...fsClient.tools,
    };

    if (interruptCtx) {
        tools.request_human_input = makeRequestHumanInputTool(interruptCtx);
    }

    return new ToolLoopAgent({
        model: bedrock("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
        tools,
        stopWhen: stepCountIs(20),
        instructions: BASE_INSTRUCTIONS,
    });
}
