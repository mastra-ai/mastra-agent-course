import { createTool } from "@mastra/core/tools";
import { z } from "zod";

interface QueueTimesResponse {
  id: number;
  name: string;
  last_updated: string;
  lands: Array<{
    id: number;
    name: string;
    rides: Array<{
      id: number;
      name: string;
      is_open: boolean;
      wait_time: number;
      last_updated: string;
    }>;
  }>;
}

interface RideItem {
  id: string;
  name: string;
  land: string;
  isOpen: boolean;
  waitTime: number;
  lastUpdatedUtc: string;
}

export const getQueueTimesLiveTool = createTool({
  id: "get-queue-times-live",
  description: "Get live queue times for rides at a theme park",
  inputSchema: z.object({
    parkId: z.number().describe("Theme park ID from queue-times.com"),
  }),
  outputSchema: z.object({
    parkId: z.number(),
    fetchedAt: z.string(),
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        land: z.string(),
        isOpen: z.boolean(),
        waitTime: z.number(),
        lastUpdatedUtc: z.string(),
      }),
    ),
  }),
  execute: async (inputData) => {
    return await getQueueTimes(inputData.parkId);
  },
});

const getQueueTimes = async (parkId: number) => {
  const url = `https://queue-times.com/parks/${parkId}/queue_times.json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch queue times for park ${parkId}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as QueueTimesResponse;
  const fetchedAt = new Date().toISOString();

  // Extract all rides from all lands
  const allRides: RideItem[] = [];

  for (const land of data.lands) {
    for (const ride of land.rides) {
      allRides.push({
        id: String(ride.id),
        name: ride.name,
        land: land.name,
        isOpen: ride.is_open,
        waitTime: ride.wait_time,
        lastUpdatedUtc: ride.last_updated,
      });
    }
  }

  // Sort by wait time ascending
  const sortedRides = allRides.sort((a, b) => a.waitTime - b.waitTime);

  return {
    parkId: parkId,
    fetchedAt: fetchedAt,
    items: sortedRides,
  };
};
