import { MCPClient } from "@mastra/mcp";

export const firecrawlMcpClient = new MCPClient({
  id: "firecrawl-mcp",
  servers: {
    firecrawl: {
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY!,
      },
    },
  },
});
