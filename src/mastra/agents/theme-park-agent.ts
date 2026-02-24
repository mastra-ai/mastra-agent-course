import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { findQueueTimesParkTool } from "../tools/find-park-tools";

export const themeParkAgent = new Agent({
  id: "theme-park-agent",
  name: "Theme Park Agent",
  instructions: `
    You help someone plan a theme park day.

    Be practical. If important details are missing, ask a question instead of guessing. Don't claim you checked live wait times, park hours, or weather.
    If something can't be verified, give honest guidance based on general patterns.

    If the user names a park, use findQueueTimesParkTool to look it up.
    If multiple matches come back, ask one clarifying question and wait.

    Keep most replies under 5 sentences.
  `,
  model: "openai/gpt-5.1",
  memory: new Memory(),
  tools: {
    findQueueTimesParkTool,
  },
});
