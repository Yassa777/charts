import { getSlepiSnapshot, formatMonth, formatNumber } from "@/lib/slepi";
import { SITE_DESCRIPTION, SITE_FULL_TITLE, SITE_ORGANIZATION, SITE_URL } from "@/lib/site";
import { AGGREGATION_METHODS, COMPONENT_METHODS, HEADLINE_DEFINITION } from "@/lib/methodology";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function line(label, value) {
  return `${label}: ${value ?? "not available"}`;
}

export async function GET() {
  const snapshot = await getSlepiSnapshot();
  const latest = snapshot.latest;
  const freshness = snapshot.freshness;
  const sourceUrl = snapshot.dataSource?.url || `${SITE_URL}/summary.json`;

  const body = [
    `# ${SITE_FULL_TITLE}`,
    "",
    SITE_DESCRIPTION,
    "",
    "## Current headline",
    line("Recommended headline series", snapshot.recommended_headline),
    line("Latest complete month", latest?.date ? formatMonth(latest.date) : null),
    line("Latest SLEPI score", Number.isFinite(latest?.slepi_adjusted) ? formatNumber(latest.slepi_adjusted, 2) : null),
    line("Status interpretation", "positive values indicate external pressure; negative values indicate support"),
    line("Latest data source", sourceUrl),
    line("Pipeline last checked CBSL", freshness?.pipeline_checked_at),
    "",
    "## Methodology",
    HEADLINE_DEFINITION,
    "",
    "Component choices:",
    ...COMPONENT_METHODS.map((method) => `- ${method}`),
    "",
    "Aggregation:",
    ...AGGREGATION_METHODS.map((method) => `- ${method}`),
    "",
    "## Machine-readable endpoints",
    `- Page: ${SITE_URL}`,
    `- Summary JSON: ${SITE_URL}/summary.json`,
    `- LLM guide: ${SITE_URL}/llms.txt`,
    "",
    "## Publisher",
    `${SITE_ORGANIZATION.name}: ${SITE_ORGANIZATION.url}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
