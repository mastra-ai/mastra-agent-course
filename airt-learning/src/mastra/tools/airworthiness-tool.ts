import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

interface FederalRegisterResponse {
  count: number;
  results?: {
    title: string;
    abstract: string | null;
    publication_date: string;
    effective_on: string | null;
    docket_id: string | null;
    html_url: string;
  }[];
}

export const airworthinessTool = createTool({
  id: 'get-airworthiness-directives',
  description:
    'Look up recent FAA Airworthiness Directives (ADs) for an aircraft manufacturer or model from the public Federal Register.',
  inputSchema: z.object({
    aircraft: z
      .string()
      .describe('Aircraft manufacturer or model, e.g. "Saab 340", "Airbus", "DHC-8", "Boeing 737"'),
    sinceDays: z
      .number()
      .int()
      .positive()
      .default(90)
      .describe('Only return ADs published within this many days'),
    limit: z.number().int().positive().max(50).default(10).describe('Max number of ADs to return'),
  }),
  outputSchema: z.object({
    aircraft: z.string(),
    count: z.number(),
    directives: z.array(
      z.object({
        title: z.string(),
        abstract: z.string().nullable(),
        publicationDate: z.string(),
        effectiveOn: z.string().nullable(),
        docketId: z.string().nullable(),
        url: z.string(),
      }),
    ),
  }),
  execute: async (inputData) => {
    return await fetchAirworthinessDirectives(
      inputData.aircraft,
      inputData.sinceDays,
      inputData.limit,
    );
  },
});

export const fetchAirworthinessDirectives = async (
  aircraft: string,
  sinceDays: number,
  limit: number,
) => {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const params = new URLSearchParams({
    'conditions[agencies][]': 'federal-aviation-administration',
    'conditions[type][]': 'RULE',
    'conditions[term]': `airworthiness directive ${aircraft}`,
    'conditions[publication_date][gte]': since,
    order: 'newest',
    per_page: String(limit),
  });
  for (const field of [
    'title',
    'abstract',
    'publication_date',
    'effective_on',
    'docket_id',
    'html_url',
  ]) {
    params.append('fields[]', field);
  }

  const url = `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Federal Register API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FederalRegisterResponse;
  const results = data.results ?? [];

  return {
    aircraft,
    count: results.length,
    directives: results.map((r) => ({
      title: r.title,
      abstract: r.abstract,
      publicationDate: r.publication_date,
      effectiveOn: r.effective_on,
      docketId: r.docket_id,
      url: r.html_url,
    })),
  };
};
