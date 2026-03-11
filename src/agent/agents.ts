import { ToolLoopAgent, stepCountIs, type ToolSet } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromIni } from "@aws-sdk/credential-providers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bashTool } from "../tools/bash";
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
    "You have two tools:",
    "1. bashTool — run any shell command: agent-browser CLI commands, cat, ls, grep, echo, curl, etc.",
    "2. request_human_input — ask the user for OTPs, passwords, or any input a human must provide.",
    "",
    "Always use bashTool to read files (cat), list directories (ls), or run agent-browser commands.",
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
    const tools: ToolSet = {
        bashTool,
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
