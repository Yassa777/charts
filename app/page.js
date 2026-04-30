import Image from "next/image";
import flag from "@/assets/flag.png";
import {
  formatMonth,
  formatNumber,
  formatPercent,
  getSlepiSnapshot,
  getComponentHistory,
  getScoreHistory,
  getStatHistory,
} from "@/lib/slepi";
import { HeroChart } from "@/components/hero-chart";
import { ComponentChart } from "@/components/component-chart";
import { ComponentRow } from "@/components/component-row";
import { StatBlock } from "@/components/stat-block";
import { HoverProvider } from "@/components/hover-context";
import { ScoreNumber } from "@/components/score-number";
import { RegimeRibbon } from "@/components/regime-ribbon";
import { BulletGauge } from "@/components/bullet-gauge";
import { getRegime, regimeLabel } from "@/components/regime";
import { SITE_DESCRIPTION, SITE_FULL_TITLE, SITE_ORGANIZATION, SITE_URL } from "@/lib/site";
import { HEADLINE_DEFINITION } from "@/lib/methodology";

export const dynamic = "force-dynamic";

const COMPONENT_COLORS = {
  reserve_block_z:                    "#6366f1",
  fx_market_pressure_z:               "#f59e0b",
  external_financing_pressure_z:      "#ec4899",
  current_account_pressure_z:         "#10b981",
};

/* ── Interpretive sentence ─────────────────────────────────────── */
function interpret(snapshot) {
  const score = snapshot.latest.slepi_adjusted;
  const delta = snapshot.delta;
  const L = snapshot.latest;

  const phrase = (z, strongP, modP, mildP, mildS, modS, strongS) => {
    const a = Math.abs(z);
    if (z > 0) return a > 1.5 ? strongP : a > 0.8 ? modP : a > 0.25 ? mildP : null;
    return a > 1.5 ? strongS : a > 0.8 ? modS : a > 0.25 ? mildS : null;
  };

  const factors = [
    { side: L.reserve_block_z > 0 ? "pressure" : "support", text: phrase(L.reserve_block_z,
        "very thin usable reserve cover", "below-average usable reserves", "slightly thin usable reserves",
        "adequate usable reserves", "solid usable reserve cover", "strong usable reserve cover") },
    { side: L.fx_market_pressure_z > 0 ? "pressure" : "support", text: phrase(L.fx_market_pressure_z,
        "sharp Rupee depreciation", "Rupee depreciation", "mild FX pressure",
        "modest Rupee stability", "a stable exchange rate", "Rupee appreciation") },
    { side: L.external_financing_pressure_z > 0 ? "pressure" : "support", text: phrase(L.external_financing_pressure_z,
        "severe rollover pressure", "external financing pressure", "mild rollover pressure",
        "manageable rollover needs", "easing external debt pressure", "strong rollover comfort") },
    { side: L.current_account_pressure_z > 0 ? "pressure" : "support", text: phrase(L.current_account_pressure_z,
        "severe external-balance pressure", "external-balance pressure", "mild balance pressure",
        "a narrowing external-balance gap", "improving external-balance conditions", "external-balance surplus") },
  ].filter((f) => f.text !== null);

  const pressures = factors.filter((f) => f.side === "pressure").map((f) => f.text);
  const supports  = factors.filter((f) => f.side === "support").map((f) => f.text);

  let opening;
  if (score >= 1.5)       opening = "External conditions are under acute pressure";
  else if (score >= 1.0)  opening = "External conditions are under notable pressure";
  else if (score >= 0.5)  opening = "External conditions show mild pressure";
  else if (score >= -0.5) opening = "External conditions are broadly neutral";
  else if (score >= -1.0) opening = "External conditions are supportive";
  else                    opening = "External conditions are firmly supportive";

  const trend = delta !== null && Math.abs(delta) > 0.1
    ? `, ${delta > 0 ? "with conditions deteriorating" : "with conditions improving"} this month`
    : "";

  let detail = "";
  if (pressures.length && supports.length) {
    detail = ` — ${pressures[0]}, offset by ${supports[0]}`;
  } else if (pressures.length > 1) {
    detail = ` — ${pressures[0]}, compounded by ${pressures[1]}`;
  } else if (pressures.length === 1) {
    detail = ` — ${pressures[0]}`;
  } else if (supports.length > 1) {
    detail = ` — ${supports[0]} and ${supports[1]}`;
  } else if (supports.length === 1) {
    detail = ` — ${supports[0]}`;
  }

  return `${opening}${trend}${detail}.`;
}

/* ── Status pill ───────────────────────────────────────────────── */
function StatusPill({ score }) {
  const regime = getRegime(score);
  const toneMap = { neutral: "quiet", supportive: "supportive", elevated: "elevated", acute: "critical" };
  return (
    <span className={`status-pill ${toneMap[regime]}`}>
      <span className="status-dot" />
      {regimeLabel(regime)}
    </span>
  );
}

/* ── Freshness rows ────────────────────────────────────────────── */
function FreshnessRow({ label, date }) {
  return (
    <div className="freshness-row">
      <span className="freshness-label">{label}</span>
      <span className="freshness-value">{date ? formatMonth(date) : "—"}</span>
    </div>
  );
}

function SourceRow({ source }) {
  const isRemote = source?.mode === "object-storage";
  return (
    <div className="freshness-row source-row">
      <span className="freshness-label">Data source</span>
      <span className="freshness-value">
        {isRemote ? "Object storage" : "Local snapshot"}
        {isRemote && source?.url && <span className="source-detail">{source.url}</span>}
      </span>
    </div>
  );
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo",
  }).format(new Date(ts));
}

function balanceSourceLabel(source) {
  switch (source) {
    case "official_current_account":
      return "official current account";
    case "goods_services_remittances_nowcast":
      return "trade + services + remittances nowcast";
    case "trade_tourism_remittances_nowcast":
      return "trade + tourism + remittances nowcast";
    case "trade_balance_fast_signal":
      return "trade-balance fast signal";
    default:
      return "balance signal";
  }
}

function buildStructuredData(snapshot) {
  const latest = snapshot.latest;
  const freshness = snapshot.freshness;

  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: SITE_FULL_TITLE,
    alternateName: "SLEPI",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    creator: {
      "@type": "Organization",
      name: SITE_ORGANIZATION.name,
      url: SITE_ORGANIZATION.url,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_ORGANIZATION.name,
      url: SITE_ORGANIZATION.url,
    },
    dateModified: freshness?.pipeline_checked_at || snapshot.built_at,
    measurementTechnique: HEADLINE_DEFINITION,
    temporalCoverage: snapshot.metrics?.sample_start && snapshot.metrics?.sample_end
      ? `${snapshot.metrics.sample_start}/${snapshot.metrics.sample_end}`
      : undefined,
    variableMeasured: [
      {
        "@type": "PropertyValue",
        name: "SLEPI adjusted headline score",
        value: latest?.slepi_adjusted,
        unitText: "standardised index score",
      },
      {
        "@type": "PropertyValue",
        name: "Adjusted usable reserve adequacy",
        value: latest?.reserve_block_z,
        unitText: "z-score",
      },
      {
        "@type": "PropertyValue",
        name: "FX market pressure",
        value: latest?.fx_market_pressure_z,
        unitText: "z-score",
      },
      {
        "@type": "PropertyValue",
        name: "External financing pressure",
        value: latest?.external_financing_pressure_z,
        unitText: "z-score",
      },
      {
        "@type": "PropertyValue",
        name: "External-balance pressure",
        value: latest?.current_account_pressure_z,
        unitText: "z-score",
      },
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${SITE_URL}/summary.json`,
      },
      snapshot.dataSource?.url
        ? {
            "@type": "DataDownload",
            encodingFormat: "application/json",
            contentUrl: snapshot.dataSource.url,
          }
        : null,
    ].filter(Boolean),
  };
}

/* ── Page ──────────────────────────────────────────────────────── */
export default async function HomePage() {
  const [snapshot, componentHistory, scoreHistory, statHistory] = await Promise.all([
    getSlepiSnapshot(),
    Promise.resolve(getComponentHistory(24)),
    Promise.resolve(getScoreHistory(60)),
    Promise.resolve(getStatHistory(18)),
  ]);

  const freshness = snapshot.freshness;
  const L = snapshot.latest;
  const P = snapshot.previous;
  const hasDelta = snapshot.delta !== null && snapshot.delta !== undefined;
  const firstBlocking = freshness.blocking_months_after_latest_complete?.[0];
  const sentence = interpret(snapshot);
  const regime = getRegime(L.slepi_adjusted);
  const crisisPeakDate = snapshot.metrics?.slepi_adjusted?.crisis_window_peak_date;
  const structuredData = buildStructuredData(snapshot);

  /* Map per-component z-score histories for mini-multiples */
  const compValues = (key) => componentHistory.map((r) => r[key]);

  return (
    <HoverProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <main className="page-shell">

        {/* ── Hero ── */}
        <section className="hero" data-regime={regime}>
          <div className="hero-backdrop" aria-hidden="true" />
          <div className="hero-left">
            <span className="eyebrow">Sri Lanka External Pressure Index</span>

            <div className="score-block">
              <div className="score-frame">
                <ScoreNumber value={L.slepi_adjusted} />
              </div>
              <StatusPill score={L.slepi_adjusted} />
            </div>

            <RegimeRibbon score={L.slepi_adjusted} />

            <p className="interpretation">
              <span className="interpretation-bar" aria-hidden="true" />
              <span className="interpretation-text">{sentence}</span>
            </p>

            <div className="hero-footnote">
              {hasDelta && (
                <span className={`hero-delta ${snapshot.delta >= 0 ? "up" : "down"}`}>
                  {snapshot.delta >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(snapshot.delta).toFixed(2)} vs previous month
                </span>
              )}
              <span className="hero-date">Latest: {formatMonth(L.date)}</span>
            </div>
          </div>

          <div className="hero-right">
            <div className="page-title">
              <Image src={flag} alt="Sri Lanka" height={38} className="page-title-flag" />
              <div className="page-title-copy">
                <span className="page-title-text">SLEPI</span>
                <span className="page-title-tagline">
                  The pressure on the Sri Lankan economy in real-time
                </span>
              </div>
            </div>
            <HeroChart history={scoreHistory} crisisPeakDate={crisisPeakDate} />
          </div>
        </section>

        {/* ── Key metrics ── */}
        <div className="stats-strip" data-regime={regime}>
          <StatBlock
            label="USD / LKR"
            value={formatNumber(L.usd_lkr, 2)}
            unit="Spot rate — higher = weaker Rupee"
            current={L.usd_lkr}
            previous={P?.usd_lkr}
            invertColor={false}
            history={statHistory}
            anchor
          />
          <StatBlock
            label="Usable cover"
            value={formatNumber(L.adjusted_usable_reserve_cover_months, 2)}
            unit="Months of imports after short-term drains"
            current={L.adjusted_usable_reserve_cover_months}
            previous={P?.adjusted_usable_reserve_cover_months}
            invertColor={true}
            history={statHistory}
          />
          <StatBlock
            label="ST debt / reserves"
            value={formatNumber(L.short_term_external_debt_to_reserves_raw, 2)}
            unit="Short-term external debt / GOR"
            current={L.short_term_external_debt_to_reserves_raw}
            previous={P?.short_term_external_debt_to_reserves_raw}
            invertColor={false}
            history={statHistory}
          />
          <StatBlock
            label="Balance signal"
            value={formatNumber(L.current_account_filled_usd_m, 0)}
            unit={`USD mn — ${balanceSourceLabel(L.current_account_pressure_source)}`}
            current={L.current_account_filled_usd_m}
            previous={P?.current_account_filled_usd_m}
            invertColor={true}
            history={statHistory}
          />
          <StatBlock
            label="Services balance"
            value={formatNumber(L.services_balance_usd_m, 0)}
            unit="USD mn — explanatory overlay"
            current={L.services_balance_usd_m}
            previous={P?.services_balance_usd_m}
            invertColor={true}
            history={statHistory}
          />
        </div>

        {/* ── Index components ── */}
        <section className="section">
          <div className="section-label">Index components</div>
          <p className="section-note">
            The SLEPI score is the equal-weighted average of four standardised component scores (z-scores).
            <span className="pressure-text"> Positive values → pressure.</span>
            <span className="support-text"> Negative values → support.</span>
            {" "}Hover a row to highlight it in the 24-month chart below.
          </p>
          <div className="components-table">
            <div className="comp-row comp-row-header">
              <span>Component</span>
              <span>Latest reading</span>
              <span>24-month trajectory</span>
              <span>Z-score / MoM</span>
            </div>
            <ComponentRow
              componentKey="reserve_block_z"
              glyph="reserves"
              color={COMPONENT_COLORS.reserve_block_z}
              title="Adjusted usable reserves"
              score={L.reserve_block_z}
              prevScore={P?.reserve_block_z}
              value={`${formatNumber(L.adjusted_usable_reserve_cover_months, 2)} mo`}
              unit="months after short-term drains"
              description="Gross official reserves less reserve-template short-term drains and FX forward/swap short positions, divided by trailing imports."
              history={compValues("reserve_block_z")}
            />
            <ComponentRow
              componentKey="fx_market_pressure_z"
              glyph="fx"
              color={COMPONENT_COLORS.fx_market_pressure_z}
              title="FX market pressure"
              score={L.fx_market_pressure_z}
              prevScore={P?.fx_market_pressure_z}
              value={formatPercent(L.fx_market_pressure_raw)}
              unit="USD/LKR MoM; NEER + reserves in z"
              description="Composite of USD/LKR depreciation, NEER depreciation and reserve-change pressure. Positive values indicate pressure."
              history={compValues("fx_market_pressure_z")}
            />
            <ComponentRow
              componentKey="external_financing_pressure_z"
              glyph="external"
              color={COMPONENT_COLORS.external_financing_pressure_z}
              title="External financing"
              score={L.external_financing_pressure_z}
              prevScore={P?.external_financing_pressure_z}
              value={formatNumber(L.short_term_external_debt_to_reserves_raw, 2)}
              unit="short-term external debt / GOR"
              description="Quarterly CBSL external debt is step-held monthly and combined with annual debt-service pressure as a rollover signal."
              history={compValues("external_financing_pressure_z")}
            />
            <ComponentRow
              componentKey="current_account_pressure_z"
              glyph="buffer"
              color={COMPONENT_COLORS.current_account_pressure_z}
              title="External balance"
              score={L.current_account_pressure_z}
              prevScore={P?.current_account_pressure_z}
              value={formatPercent(L.current_account_pressure_raw)}
              unit={balanceSourceLabel(L.current_account_pressure_source)}
              description="Uses official current account when available, otherwise a bias-adjusted ladder from services/remittances, tourism/remittances, or trade balance."
              history={compValues("current_account_pressure_z")}
            />
          </div>
        </section>

        {/* ── 24-month component history ── */}
        <section className="section">
          <div className="section-label">24-month component history</div>
          <p className="section-note">
            Each line shows a component's standardised score over time. Use the toggles to isolate individual drivers.
            Coloured bands mark the same pressure zones as the index chart above; dashed vertical lines mark regime transitions.
          </p>
          <ComponentChart history={componentHistory} />
        </section>

        {/* ── Advanced stats ── */}
        <section className="advanced-section">
          <details className="advanced-disclosure">
            <summary className="advanced-summary">
              <span className="advanced-summary-copy">
                <span className="advanced-summary-label">Advanced stats</span>
                <span className="advanced-summary-note">Validation, freshness, and pipeline status</span>
              </span>
              <span className="advanced-summary-icon" aria-hidden="true">▾</span>
            </summary>

            <div className="panels-grid">
              <article className="panel-card">
                <span className="panel-eyebrow">Validation</span>
                <h2 className="panel-title">Backtest</h2>

                <div className="backtest-gauges">
                  <BulletGauge
                    label="AUC — top 15% stress"
                    value={snapshot.metrics.slepi_adjusted.auc_for_top_15pct_future_stress_event}
                    min={0.5} max={1} reference={0.5}
                    format={(v) => v.toFixed(3)}
                  />
                  <BulletGauge
                    label="3-month correlation"
                    value={snapshot.metrics.slepi_adjusted.correlation_with_future_external_stress_3m}
                    min={-1} max={1} reference={0}
                    format={(v) => v.toFixed(3)}
                  />
                </div>

                <div className="backtest-meta">
                  <div>
                    <div className="backtest-item-label">Crisis peak</div>
                    <div className="backtest-item-value sm">
                      {formatMonth(snapshot.metrics.slepi_adjusted.crisis_window_peak_date)}
                    </div>
                  </div>
                  <div>
                    <div className="backtest-item-label">Proxy overlap</div>
                    <div className="backtest-item-value sm">
                      {snapshot.metrics.proxy_fit.overlap_months} months
                    </div>
                  </div>
                </div>
              </article>

              <article className="panel-card">
                <span className="panel-eyebrow">Freshness</span>
                <h2 className="panel-title">Data availability</h2>
                <div className="freshness-grid">
                  <SourceRow source={snapshot.dataSource} />
                  <FreshnessRow label="Latest complete index" date={freshness.latest_complete_month.date} />
                  <FreshnessRow label="FX" date={freshness.latest_available_months.fx_market_pressure} />
                  <FreshnessRow label="Balance pressure" date={freshness.latest_available_months.balance_pressure} />
                  <FreshnessRow label="Official current account" date={freshness.latest_available_months.current_account} />
                  <FreshnessRow label="Usable reserves" date={freshness.latest_available_months.adjusted_usable_reserves} />
                  <FreshnessRow label="External debt" date={freshness.latest_available_months.external_debt} />
                  <FreshnessRow label="M2b / NFA" date={freshness.latest_available_months.m2b_nfa} />
                  <FreshnessRow label="Trade balance" date={freshness.latest_available_months.trade_balance} />
                </div>
                {firstBlocking && (
                  <p className="panel-note">
                    Next window ({formatMonth(firstBlocking.date)}) pending:{" "}
                    {firstBlocking.missing_requirements.join(", ")}.
                  </p>
                )}
                <p className="panel-note">
                  Pipeline last checked CBSL on {formatTimestamp(freshness.pipeline_checked_at)}.
                </p>
              </article>
            </div>
          </details>
        </section>

      </main>
    </HoverProvider>
  );
}
