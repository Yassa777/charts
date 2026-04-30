import { getSlepiSnapshot } from "@/lib/slepi";
import { SITE_DESCRIPTION, SITE_FULL_TITLE, SITE_ORGANIZATION, SITE_URL } from "@/lib/site";
import { AGGREGATION_METHODS, COMPONENT_METHODS, HEADLINE_DEFINITION } from "@/lib/methodology";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pickLatest(latest) {
  return {
    date: latest?.date ?? null,
    slepi_adjusted: latest?.slepi_adjusted ?? null,
    interpretation_basis: "positive values indicate external pressure; negative values indicate support",
    adjusted_usable_reserve_cover_months: latest?.adjusted_usable_reserve_cover_months ?? null,
    fx_market_pressure_z: latest?.fx_market_pressure_z ?? null,
    external_financing_pressure_z: latest?.external_financing_pressure_z ?? null,
    external_balance_pressure_z: latest?.current_account_pressure_z ?? null,
    external_balance_source: latest?.current_account_pressure_source ?? null,
    current_account_filled_usd_m: latest?.current_account_filled_usd_m ?? null,
    usd_lkr: latest?.usd_lkr ?? null,
  };
}

export async function GET() {
  const snapshot = await getSlepiSnapshot();

  return Response.json(
    {
      name: SITE_FULL_TITLE,
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      publisher: SITE_ORGANIZATION,
      recommended_headline: snapshot.recommended_headline,
      headline_definition: HEADLINE_DEFINITION,
      methodology: {
        components: COMPONENT_METHODS,
        aggregation: AGGREGATION_METHODS,
      },
      source_snapshot_headline_definition: snapshot.headline_definition ?? null,
      latest: pickLatest(snapshot.latest),
      previous: pickLatest(snapshot.previous),
      delta: snapshot.delta ?? null,
      freshness: snapshot.freshness,
      metrics: snapshot.metrics,
      data_source: snapshot.dataSource,
      machine_readable: {
        llms_txt: `${SITE_URL}/llms.txt`,
        summary_json: `${SITE_URL}/summary.json`,
      },
    },
    {
      headers: {
        "cache-control": "public, max-age=300",
      },
    }
  );
}
