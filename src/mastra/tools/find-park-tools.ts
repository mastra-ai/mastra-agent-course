import { createTool } from "@mastra/core/tools";
import { z } from "zod";

type ParkGroup = {
  name: string;
  parks: Array<{
    id: number;
    name: string;
    country?: string;
    timezone?: string;
  }>;
};

export const findQueueTimesParkTool = createTool({
  id: "findQueueTimesParkTool",
  description: "Find a Queue-Times parkId by park name.",
  inputSchema: z.object({
    parkName: z.string().min(2).describe("Park name, like 'Animal Kingdom'"),
    maxResults: z.number().int().min(1).max(5).default(3),
  }),
  outputSchema: z.object({
    matches: z.array(
      z.object({
        parkId: z.number(),
        name: z.string(),
        parkUrl: z.string(),
        groupName: z.string().optional(),
      }),
    ),
  }),
  execute: async (inputData) => {
    return await findParks(inputData.parkName, inputData.maxResults);
  },
});

async function findParks(parkName: string, maxResults: number) {
  const res = await fetch("https://queue-times.com/parks.json");
  if (!res.ok) throw new Error(`Queue-Times parks failed: ${res.status}`);

  const groups = (await res.json()) as ParkGroup[];
  const q = parkName.toLowerCase();

  const matches = (groups ?? [])
    .flatMap((g) =>
      (g.parks ?? []).map((p) => ({
        parkId: p.id,
        name: p.name,
        parkUrl: `https://queue-times.com/en-US/parks/${p.id}`,
        groupName: g.name,
      })),
    )
    .filter((p) => p.name.toLowerCase().includes(q))
    .slice(0, maxResults);

  return { matches };
}
