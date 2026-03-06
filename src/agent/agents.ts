import { ToolLoopAgent, stepCountIs } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromIni } from "@aws-sdk/credential-providers";
import { bashTool } from "../tools/bash";
import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const bedrock = createAmazonBedrock({
    region: "us-east-1",
    credentialProvider: fromIni({ profile: "clickpe" }),
});

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
        instructions: `You are a browser automation agent. Use the bash tool to run agent-browser commands:
- agent-browser open <url>
- agent-browser snapshot -i
- agent-browser click @e1
- agent-browser fill @e2 "text"
- agent-browser screenshot
- agent-browser close
Always re-snapshot after navigation. Default cwd: /home/manish/pos-agent for the further commands please do check the SKILL.md file .`,
    });
}
