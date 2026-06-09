import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fetchAirworthinessDirectives } from '../tools/airworthiness-tool';

const AIRCRAFT = 'Saab 340';
const MATCH_TERMS = ['saab 340', 'saab ab'];
const STATE_FILE = path.resolve(process.cwd(), '.mastra-state', 'saab340-seen.json');

async function loadSeen(): Promise<string[] | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw) as string[];
  } catch {
    return null; // no file yet => first run
  }
}

async function saveSeen(urls: string[]): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(urls, null, 2), 'utf8');
}

async function sendEmail(subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey || !to) {
    console.warn(
      '[saab-ad-alert] RESEND_API_KEY or ALERT_EMAIL_TO not set — skipping email send. Subject was:',
      subject,
    );
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    console.error('[saab-ad-alert] Resend error:', res.status, await res.text());
    return false;
  }
  return true;
}

type Directive = Awaited<
  ReturnType<typeof fetchAirworthinessDirectives>
>['directives'][number];

function directiveHtml(d: Directive): string {
  return `<li style="margin-bottom:12px">
    <strong><a href="${d.url}">${d.title}</a></strong><br/>
    Published: ${d.publicationDate}${d.effectiveOn ? ` &middot; Effective: ${d.effectiveOn}` : ''}${d.docketId ? ` &middot; ${d.docketId}` : ''}<br/>
    ${d.abstract ?? ''}
  </li>`;
}

const checkAndNotify = createStep({
  id: 'check-and-notify',
  inputSchema: z.object({}),
  outputSchema: z.object({
    matched: z.number(),
    newCount: z.number(),
    notified: z.boolean(),
    firstRun: z.boolean(),
  }),
  execute: async () => {
    // Pull the last two years of Saab 340 ADs (they're infrequent, so a wider
    // window keeps the baseline meaningful without affecting new-AD detection).
    const { directives } = await fetchAirworthinessDirectives(AIRCRAFT, 730, 50);

    // Drop loosely-related rules the full-text search picks up.
    const matched = directives.filter((d) => {
      const hay = `${d.title} ${d.abstract ?? ''}`.toLowerCase();
      return MATCH_TERMS.some((t) => hay.includes(t));
    });
    const matchedUrls = matched.map((d) => d.url);

    const seen = await loadSeen();

    // First run: baseline silently so we don't email a year of back-history.
    if (seen === null) {
      await saveSeen(matchedUrls);
      const notified = await sendEmail(
        `Saab 340 AD monitor is live (${matched.length} existing ADs tracked)`,
        `<p>Monitoring is active. You'll get an email when a <strong>new</strong> Airworthiness Directive for the ${AIRCRAFT} is published.</p>
         <p>Currently tracking ${matched.length} existing AD(s); these will not be re-sent.</p>`,
      );
      return { matched: matched.length, newCount: 0, notified, firstRun: true };
    }

    const seenSet = new Set(seen);
    const fresh = matched.filter((d) => !seenSet.has(d.url));

    if (fresh.length === 0) {
      return { matched: matched.length, newCount: 0, notified: false, firstRun: false };
    }

    const notified = await sendEmail(
      `${fresh.length} new Saab 340 Airworthiness Directive${fresh.length > 1 ? 's' : ''}`,
      `<p>New FAA Airworthiness Directive(s) published for the ${AIRCRAFT}:</p>
       <ul>${fresh.map(directiveHtml).join('')}</ul>`,
    );

    // Record as seen regardless of email outcome only if email succeeded,
    // so a transient send failure retries on the next run.
    if (notified) {
      await saveSeen([...seen, ...fresh.map((d) => d.url)]);
    }

    return {
      matched: matched.length,
      newCount: fresh.length,
      notified,
      firstRun: false,
    };
  },
});

export const saabAdAlertWorkflow = createWorkflow({
  id: 'saab-ad-alert',
  inputSchema: z.object({}),
  outputSchema: z.object({
    matched: z.number(),
    newCount: z.number(),
    notified: z.boolean(),
    firstRun: z.boolean(),
  }),
  schedule: {
    cron: '0 8 * * *',
    timezone: 'America/New_York',
    inputData: {},
  },
})
  .then(checkAndNotify)
  .commit();
