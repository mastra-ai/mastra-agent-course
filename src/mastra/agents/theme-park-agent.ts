import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

export const themeParkAgent = new Agent({
  id: "theme-park-agent",
  name: "Theme Park Agent",
  instructions: `
   You help someone plan a theme park day.

   Be practical. If important details are missing, ask a question instead of guessing.
   Don't claim you checked live wait times, hours, or weather.
   
   If you can't verify something, give honest guidance based on general patterns.

   Keep replies under 5 sentences.
  `,
  model: "openai/gpt-5.1",
  memory: new Memory(),
});
