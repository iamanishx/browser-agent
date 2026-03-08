import { ToolLoopAgent, stepCountIs } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromIni } from "@aws-sdk/credential-providers";
import { bashTool } from "../tools/bash";
import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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

const BASE_INSTRUCTIONS = `You are a browser automation agent. Use the bash tool to run agent-browser commands:
- agent-browser open <url>
- agent-browser snapshot -i
- agent-browser click @e1
- agent-browser fill @e2 "text"
- agent-browser screenshot
- agent-browser close
Always re-snapshot after navigation. Default cwd: /home/manish/browser-agent for the further commands please do check the SKILL.md file.`;

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

export async function createWebAgent() {
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

    return new ToolLoopAgent({
        model: bedrock("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
        tools: { bashTool, ...fsClient.tools },
        stopWhen: stepCountIs(20),
        instructions: BASE_INSTRUCTIONS,
    });
}
