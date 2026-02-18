import { Hono } from 'hono';
import { ToolLoopAgent } from 'ai';


const app = new Hono();

const function Agent (userInput: string) {
  const agent = new ToolLoopAgent();
  const response = await agent.run(userInput);
  return response;
}
