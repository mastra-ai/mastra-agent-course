import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { mockChargeTool } from "../tools/mock-charge-tool";
import { findQueueTimesParkTool } from "../tools/find-park-tools";

const inputSchema = z.object({
  parkName: z.string().min(2),
  date: z.string().min(4),
  quantity: z.number().int().min(1).max(12).default(2),
  unitPriceUsd: z.number().positive().default(110),
});

const quoteSchema = z.object({
  parkName: z.string(),
  date: z.string(),
  quantity: z.number(),
  unitPriceUsd: z.number(),
  feesUsd: z.number(),
  totalUsd: z.number(),
});

const resultSchema = z.object({
  status: z.enum(["confirmed", "cancelled"]),
  note: z.string(),
  quote: quoteSchema,
  confirmationId: z.string().optional(),
  card: z.object({ brand: z.string(), last4: z.string() }).optional(),
  visitBrief: z.string().optional(),
});

const validatePark = createStep({
  id: "validate-park",
  inputSchema,
  outputSchema: inputSchema,
  execute: async ({ inputData }) => {
    const result = await findQueueTimesParkTool.execute!(
      { parkName: inputData.parkName, maxResults: 1 },
      {},
    );

    if ("error" in result) {
      throw new Error(`Park lookup failed: ${result.message}`);
    }

    if (!result.matches.length) {
      throw new Error(`No parks found matching "${inputData.parkName}".`);
    }

    return {
      ...inputData,
      parkName: result.matches[0].name,
      unitPriceUsd:
        getKnownTicketPrice(result.matches[0].parkId) ?? inputData.unitPriceUsd,
    };
  },
});

const buildQuote = createStep({
  id: "build-quote",
  inputSchema,
  outputSchema: quoteSchema,
  execute: async ({ inputData }) => {
    const { unitPriceUsd, ...rest } = inputData;
    const feesUsd = Math.max(
      5,
      Math.round(unitPriceUsd * rest.quantity * 0.06),
    );
    return {
      ...rest,
      unitPriceUsd,
      feesUsd,
      totalUsd: unitPriceUsd * rest.quantity + feesUsd,
    };
  },
});

const chargeCard = createStep({
  id: "charge-card",
  inputSchema: quoteSchema,
  outputSchema: resultSchema,
  execute: async ({ inputData }) => {
    const charge = await mockChargeTool.execute!(
      { amountUsd: inputData.totalUsd },
      {},
    );

    if ("error" in charge) {
      return {
        status: "cancelled" as const,
        note: "Payment failed.",
        quote: inputData,
      };
    }

    return {
      status: "confirmed" as const,
      confirmationId: charge.paymentIntentId,
      card: charge.card,
      note: "Simulated charge complete. No money was charged.",
      quote: inputData,
    };
  },
});

const postPurchaseSummary = createStep({
  id: "post-purchase-summary",
  inputSchema: resultSchema,
  outputSchema: resultSchema,
  execute: async ({ inputData, mastra }) => {
    if (inputData.status !== "confirmed") {
      return inputData;
    }

    const { parkName, date, quantity, totalUsd } = inputData.quote;
    const { confirmationId, card } = inputData;
    const agent = mastra?.getAgent("themeParkAgent");

    if (!agent) {
      return inputData;
    }

    const cardDesc = card
      ? `${card.brand} ending in ${card.last4}`
      : "card on file";
    const prompt =
      `A user just booked ${quantity} ticket(s) to ${parkName} for ${date} ` +
      `(total $${totalUsd}, charged to ${cardDesc}, confirmation ${confirmationId ?? "N/A"}).\n\n` +
      `Using your tools, check the crowd forecast and historical busy-day data for ${date} at ${parkName}.\n\n` +
      `Then reply with a concise 3-point visit brief:\n` +
      `1. Best arrival time and why\n` +
      `2. One must-do attraction in the first 30 minutes\n` +
      `3. One specific thing to avoid or watch out for`;

    const visitBrief = (await agent.generate(prompt)).text;

    return { ...inputData, visitBrief };
  },
});

export const simulateTicketPurchaseWorkflow = createWorkflow({
  id: "simulate-ticket-purchase-workflow",
  inputSchema,
  outputSchema: resultSchema,
})
  .then(validatePark)
  .then(buildQuote)
  .then(chargeCard)
  .then(postPurchaseSummary)
  .commit();

function getKnownTicketPrice(parkId: number): number | undefined {
  const knownPrices: Record<number, number> = {
    5: 179,
    6: 189,
    7: 184,
    8: 169,
    21: 109,
    24: 119,
    50: 89,
    64: 159,
    65: 154,
    280: 99,
    316: 49,
    334: 179,
  };

  return knownPrices[parkId];
}
