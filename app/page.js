import Image from "next/image";
import flag from "@/assets/flag.png";
import {
  formatMonth,
  formatNumber,
  formatPercent,
  getSlepiSnapshot,
  getComponentHistory,
} from "@/lib/slepi";
import { MiniSparkline } from "@/components/mini-sparkline";
import { ComponentChart } from "@/components/component-chart";

export const dynamic = "force-dynamic";

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
        "very thin reserve cover", "below-average reserve cover", "slightly thin reserve cover",
        "adequate reserve cover", "solid import cover", "strong import cover") },
    { side: L.fx_market_pressure_z > 0 ? "pressure" : "support", text: phrase(L.fx_market_pressure_z,
        "sharp Rupee depreciation", "Rupee depreciation", "mild FX pressure",
        "modest Rupee stability", "a stable exchange rate", "Rupee appreciation") },
    { side: L.external_balance_pressure_adjusted_z > 0 ? "pressure" : "support", text: phrase(L.external_balance_pressure_adjusted_z,
        "a severe current account deficit", "current account pressure", "mild external balance pressure",
        "a narrowing current account gap", "improving external balance", "current account surplus") },
    { side: L.buffer_inflow_support_z > 0 ? "pressure" : "support", text: phrase(L.buffer_inflow_support_z,
        "very weak buffer inflows", "weak remittance and tourism inflows", "below-trend buffer inflows",
        "supportive inflow trends", "strong remittance and tourism inflows", "very strong buffer inflows") },
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

/* ── MoM delta badge ───────────────────────────────────────────── */
function MomBadge({ current, previous, invertColor }) {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.04) return null;
  // Positive delta = more pressure = red (bad), unless invertColor (for metrics like import cover)
  const isUp = delta > 0;
  const isBad = invertColor ? !isUp : isUp;
  return (
    <span className={`mom-badge ${isBad ? "bad" : "good"}`}>
      {isUp ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}
    </span>
  );
}

/* ── Status pill ───────────────────────────────────────────────── */
function StatusPill({ score }) {
  let tone = "quiet", label = "Calm";
  if (score >= 1.5)       { tone = "critical";   label = "Acute pressure"; }
  else if (score >= 0.5)  { tone = "elevated";   label = "Elevated pressure"; }
  else if (score <= -0.5) { tone = "supportive"; label = "Supportive"; }
  return (
    <span className={`status-pill ${tone}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

/* ── Info icon ─────────────────────────────────────────────────── */
function InfoIcon({ text }) {
  return (
    <span className="info-icon">
      i<span className="info-tooltip">{text}</span>
    </span>
  );
}

/* ── Component row ─────────────────────────────────────────────── */
function ComponentRow({ title, score, prevScore, value, unit, description }) {
  const isPositive = score >= 0;
  const pct = Math.min(Math.abs(score) / 2 * 50, 50);
  const dir = isPositive ? "pressure" : "support";

  return (
    <div className="comp-row">
      <div className="comp-name">
        {title}
        <InfoIcon text={description} />
      </div>
      <div className="comp-value-block">
        <span className="comp-value">{value}</span>
        <span className="comp-unit">{unit}</span>
      </div>
      <div className="comp-bar-wrap">
        <div className="comp-bar-track">
          <div className="comp-bar-center-tick" />
          <div
            className={`comp-bar-fill ${dir}`}
            style={{
              width: `${pct}%`,
              ...(isPositive ? { left: "50%" } : { right: "50%" }),
            }}
          />
        </div>
      </div>
      <div className={`comp-zscore-wrap`}>
        <span className={`comp-zscore ${dir}`}>
          {isPositive ? "+" : ""}{score.toFixed(2)}
        </span>
        <MomBadge current={score} previous={prevScore} />
      </div>
    </div>
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

/* ── Page ──────────────────────────────────────────────────────── */
export default async function HomePage() {
  const [snapshot, componentHistory] = await Promise.all([
    getSlepiSnapshot(),
    Promise.resolve(getComponentHistory()),
  ]);

  const freshness = snapshot.freshness;
  const L = snapshot.latest;
  const P = snapshot.previous;
  const hasDelta = snapshot.delta !== null && snapshot.delta !== undefined;
  const firstBlocking = freshness.blocking_months_after_latest_complete?.[0];
  const sentence = interpret(snapshot);

  return (
    <main className="page-shell">

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-left">
          <span className="eyebrow">Sri Lanka External Pressure Index</span>

          <div className="score-block">
            <div className="score-number">{formatNumber(L.slepi_adjusted, 2)}</div>
            <StatusPill score={L.slepi_adjusted} />
          </div>

          <p className="interpretation">{sentence}</p>

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
          <MiniSparkline values={snapshot.sparklineValues} startDate={snapshot.sparklineStart} />
        </div>
      </section>

      {/* ── Key metrics ── */}
      <div className="stats-strip">
        <div className="stat-block">
          <span className="stat-label">USD / LKR</span>
          <div className="stat-value-row">
            <span className="stat-value">{formatNumber(L.usd_lkr, 2)}</span>
            <MomBadge current={L.usd_lkr} previous={P?.usd_lkr} invertColor={false} />
          </div>
          <span className="stat-unit">Spot rate — higher = weaker Rupee</span>
        </div>
        <div className="stat-block">
          <span className="stat-label">Import cover</span>
          <div className="stat-value-row">
            <span className="stat-value">{formatNumber(L.import_cover_months, 2)}</span>
            <MomBadge current={L.import_cover_months} previous={P?.import_cover_months} invertColor={true} />
          </div>
          <span className="stat-unit">Months of imports covered</span>
        </div>
        <div className="stat-block">
          <span className="stat-label">Current account</span>
          <div className="stat-value-row">
            <span className="stat-value">{formatNumber(L.current_account_filled_usd_m, 0)}</span>
            <MomBadge current={L.current_account_filled_usd_m} previous={P?.current_account_filled_usd_m} invertColor={true} />
          </div>
          <span className="stat-unit">USD mn — negative = deficit</span>
        </div>
        <div className="stat-block">
          <span className="stat-label">Buffer inflows</span>
          <div className="stat-value-row">
            <span className="stat-value">{formatNumber(L.buffer_inflows_usd_m, 0)}</span>
            <MomBadge current={L.buffer_inflows_usd_m} previous={P?.buffer_inflows_usd_m} invertColor={true} />
          </div>
          <span className="stat-unit">USD mn — remittances + tourism</span>
        </div>
      </div>

      {/* ── Index components ── */}
      <section className="section">
        <div className="section-label">Index components</div>
        <p className="section-note">
          The SLEPI score is the equal-weighted average of four standardised component scores (z-scores).
          <span className="pressure-text"> Positive values → pressure.</span>
          <span className="support-text"> Negative values → support.</span>
          {" "}Month-on-month changes are shown alongside each score.
        </p>
        <div className="components-table">
          <div className="comp-row comp-row-header">
            <span>Component</span>
            <span>Latest reading</span>
            <span>Contribution ← neutral →</span>
            <span>Z-score / MoM</span>
          </div>
          <ComponentRow
            title="Import cover"
            score={L.reserve_block_z}
            prevScore={P?.reserve_block_z}
            value={`${formatNumber(L.import_cover_months, 2)} mo`}
            unit="months of gross reserve cover"
            description="Gross official reserves divided by monthly imports. Higher coverage means the central bank can sustain more months of imports — reducing external pressure."
          />
          <ComponentRow
            title="FX market pressure"
            score={L.fx_market_pressure_z}
            prevScore={P?.fx_market_pressure_z}
            value={formatPercent(L.fx_market_pressure_raw)}
            unit="month-on-month USD/LKR change"
            description="Month-on-month change in the USD/LKR exchange rate. Positive values indicate Rupee depreciation, adding to external pressure."
          />
          <ComponentRow
            title="External balance"
            score={L.external_balance_pressure_adjusted_z}
            prevScore={P?.external_balance_pressure_adjusted_z}
            value={formatPercent(L.external_balance_pressure_adjusted_raw)}
            unit="current account / GDP, net of buffers"
            description="Current account deficit as a share of GDP, net of remittances and tourism. Captures the underlying external financing gap after buffer inflows."
          />
          <ComponentRow
            title="Buffer inflow support"
            score={L.buffer_inflow_support_z}
            prevScore={P?.buffer_inflow_support_z}
            value={formatPercent(-L.buffer_inflow_support_raw)}
            unit="remittances + tourism / GDP"
            description="Remittances plus tourism earnings as a share of GDP. Strong inflows from these sources reduce pressure by providing a steady foreign exchange buffer."
          />
        </div>
      </section>

      {/* ── 24-month component history ── */}
      <section className="section">
        <div className="section-label">24-month component history</div>
        <p className="section-note">
          Each line shows a component's standardised score over time. Use the toggles to isolate individual drivers.
          Coloured bands mark the same pressure zones as the index chart above.
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
              <div className="backtest-grid">
                <div>
                  <div className="backtest-item-label">AUC — top 15% stress</div>
                  <div className="backtest-item-value">
                    {formatNumber(snapshot.metrics.slepi_adjusted.auc_for_top_15pct_future_stress_event, 3)}
                  </div>
                </div>
                <div>
                  <div className="backtest-item-label">3-month correlation</div>
                  <div className="backtest-item-value">
                    {formatNumber(snapshot.metrics.slepi_adjusted.correlation_with_future_external_stress_3m, 3)}
                  </div>
                </div>
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
                <FreshnessRow label="Current account" date={freshness.latest_available_months.current_account} />
                <FreshnessRow label="Reserves" date={freshness.latest_available_months.gross_reserves} />
                <FreshnessRow label="Imports" date={freshness.latest_available_months.imports} />
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
  );
}
