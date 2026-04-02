import {
  formatMonth,
  formatNumber,
  formatPercent,
  getSlepiSnapshot,
} from "@/lib/slepi";
import { MiniSparkline } from "@/components/mini-sparkline";

export const dynamic = "force-dynamic";

function StatusPill({ score }) {
  let tone = "quiet";
  let label = "Calm";

  if (score >= 1.5) {
    tone = "critical";
    label = "Acute pressure";
  } else if (score >= 0.5) {
    tone = "elevated";
    label = "Elevated pressure";
  } else if (score <= -0.5) {
    tone = "supportive";
    label = "Supportive";
  }

  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function MetricRow({ label, value, note }) {
  return (
    <div className="metric-row">
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-note">{note}</div>
      </div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function FreshnessRow({ label, date }) {
  return (
    <div className="freshness-row">
      <span className="freshness-label">{label}</span>
      <span className="freshness-value">{date ? formatMonth(date) : "n/a"}</span>
    </div>
  );
}

function SourceRow({ source }) {
  const isRemote = source?.mode === "object-storage";
  const label = isRemote ? "Object storage" : "Local snapshot";
  const detail = isRemote && source?.url ? source.url : "Workspace fallback";

  return (
    <div className="freshness-row source-row">
      <span className="freshness-label">Frontend data source</span>
      <span className="freshness-value">
        <strong>{label}</strong>
        <span className="source-detail">{detail}</span>
      </span>
    </div>
  );
}

function ComponentCard({ title, score, value, note }) {
  const width = `${Math.min(Math.abs(score) * 20, 100)}%`;
  const direction = score >= 0 ? "pressure" : "support";

  return (
    <article className="component-card">
      <div className="component-head">
        <h3>{title}</h3>
        <span className={`component-score ${direction}`}>{formatNumber(score, 2)}</span>
      </div>
      <div className="component-value">{value}</div>
      <div className="component-note">{note}</div>
      <div className="component-track">
        <div className={`component-fill ${direction}`} style={{ width }} />
      </div>
    </article>
  );
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Colombo",
  }).format(new Date(timestamp));
}

export default async function HomePage() {
  const snapshot = await getSlepiSnapshot();
  const freshness = snapshot.freshness;
  const firstBlockingMonth = freshness.blocking_months_after_latest_complete?.[0];
  const hasDelta = snapshot.delta !== null && snapshot.delta !== undefined;
  const enriched = snapshot.enriched;
  const hasEnriched = enriched?.latest?.slepi_enriched != null;
  const hasEnrichedDelta = enriched?.delta !== null && enriched?.delta !== undefined;

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-meta">
          <span className="eyebrow">Sri Lanka External Pressure Index</span>
          <span className="hero-date">Latest complete month: {formatMonth(snapshot.latest.date)}</span>
        </div>

        <div className="hero-grid">
          <div className="hero-main">
            <div className="hero-status">
              <StatusPill score={snapshot.latest.slepi_adjusted} />
              <span className="hero-method">Headline: adjusted SLEPI</span>
            </div>

            <div className="hero-number-block">
              <div className="hero-number">{formatNumber(snapshot.latest.slepi_adjusted, 2)}</div>
              {hasDelta ? (
                <div className={`hero-delta ${snapshot.delta >= 0 ? "up" : "down"}`}>
                  {snapshot.delta >= 0 ? "+" : ""}
                  {formatNumber(snapshot.delta, 2)} vs previous month
                </div>
              ) : (
                <div className="hero-delta down">Previous month comparison unavailable</div>
              )}
            </div>

            <p className="hero-copy">
              A compact read on Sri Lanka’s external pressure using reserve adequacy, FX stress,
              underlying external balance, inflow support, debt service, and portfolio flows.
            </p>
          </div>

          <div className="hero-chart-card">
            <div className="chart-label">24-month path</div>
            <MiniSparkline values={snapshot.sparklineValues} />
            <div className="chart-range">
              <span>{formatMonth(snapshot.sparklineStart)}</span>
              <span>{formatMonth(snapshot.sparklineEnd)}</span>
            </div>
          </div>
        </div>

        {hasEnriched ? (
          <div className="enriched-banner">
            <div className="enriched-meta">
              <span className="eyebrow">Enriched SLEPI (6-block)</span>
              <span className="enriched-date">Through {formatMonth(enriched.latest.date)}</span>
            </div>
            <div className="enriched-number-block">
              <span className="enriched-number">{formatNumber(enriched.latest.slepi_enriched, 2)}</span>
              <StatusPill score={enriched.latest.slepi_enriched} />
              {hasEnrichedDelta ? (
                <span className={`enriched-delta ${enriched.delta >= 0 ? "up" : "down"}`}>
                  {enriched.delta >= 0 ? "+" : ""}{formatNumber(enriched.delta, 2)}
                </span>
              ) : null}
            </div>
            <p className="enriched-note">
              Extends the adjusted index with debt service pressure and net portfolio flow pressure
              from CBSL quarterly BOP data. Lags the headline by roughly one quarter.
            </p>
          </div>
        ) : null}
      </section>

      <section className="stats-grid">
        <MetricRow
          label="USD/LKR"
          note="Monthly average spot rate"
          value={formatNumber(snapshot.latest.usd_lkr, 2)}
        />
        <MetricRow
          label="Import cover"
          note="Months of imports"
          value={formatNumber(snapshot.latest.import_cover_months, 2)}
        />
        <MetricRow
          label="Current account"
          note="USD mn"
          value={formatNumber(snapshot.latest.current_account_filled_usd_m, 0)}
        />
        <MetricRow
          label="Buffer inflows"
          note="Remittances + tourism, USD mn"
          value={formatNumber(snapshot.latest.buffer_inflows_usd_m, 0)}
        />
        <MetricRow
          label="Debt service"
          note="Primary income debit, USD mn (quarterly)"
          value={formatNumber(snapshot.latest.primary_income_debit_usd_m, 0)}
        />
        <MetricRow
          label="Portfolio flows"
          note="Net portfolio investment, USD mn (quarterly)"
          value={formatNumber(snapshot.latest.portfolio_investment_usd_m, 0)}
        />
      </section>

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">Index construction</span>
          <h2>Six blocks</h2>
        </div>

        <div className="components-grid">
          <ComponentCard
            title="Import cover"
            score={snapshot.latest.reserve_block_z}
            value={`${formatNumber(snapshot.latest.import_cover_months, 2)} months`}
            note="Lower reserve cover pushes pressure up."
          />
          <ComponentCard
            title="FX market pressure"
            score={snapshot.latest.fx_market_pressure_z}
            value={formatPercent(snapshot.latest.fx_market_pressure_raw)}
            note="Positive values reflect monthly depreciation pressure."
          />
          <ComponentCard
            title="External balance pressure"
            score={snapshot.latest.external_balance_pressure_adjusted_z}
            value={formatPercent(snapshot.latest.external_balance_pressure_adjusted_raw)}
            note="Current-account pressure net of remittances and tourism."
          />
          <ComponentCard
            title="Buffer inflow support"
            score={snapshot.latest.buffer_inflow_support_z}
            value={formatPercent(-snapshot.latest.buffer_inflow_support_raw)}
            note="Higher remittance and tourism support pushes pressure down."
          />
          <ComponentCard
            title="Debt service pressure"
            score={snapshot.latest.debt_service_pressure_z}
            value={formatPercent(snapshot.latest.debt_service_pressure_raw)}
            note="Higher interest payments relative to imports increase pressure. Quarterly BOP data."
          />
          <ComponentCard
            title="Portfolio flow pressure"
            score={snapshot.latest.net_portfolio_pressure_z}
            value={formatPercent(snapshot.latest.net_portfolio_pressure_raw)}
            note="Net portfolio outflows increase pressure. Quarterly BOP data."
          />
        </div>
      </section>

      <section className="two-column">
        <article className="panel-card">
          <span className="eyebrow">Validation</span>
          <h2>Backtest snapshot</h2>
          <div className="backtest-grid">
            <div>
              <div className="stat-kicker">Adjusted SLEPI AUC</div>
              <div className="stat-number">
                {formatNumber(snapshot.metrics.slepi_adjusted.auc_for_top_15pct_future_stress_event, 3)}
              </div>
            </div>
            <div>
              <div className="stat-kicker">Adjusted correlation</div>
              <div className="stat-number">
                {formatNumber(snapshot.metrics.slepi_adjusted.correlation_with_future_external_stress_3m, 3)}
              </div>
            </div>
            <div>
              <div className="stat-kicker">Crisis peak</div>
              <div className="stat-number small">{formatMonth(snapshot.metrics.slepi_adjusted.crisis_window_peak_date)}</div>
            </div>
            <div>
              <div className="stat-kicker">Proxy overlap</div>
              <div className="stat-number small">{snapshot.metrics.proxy_fit.overlap_months} months</div>
            </div>
            {snapshot.metrics.slepi_enriched?.auc_for_top_15pct_future_stress_event != null ? (
              <div>
                <div className="stat-kicker">Enriched AUC</div>
                <div className="stat-number">
                  {formatNumber(snapshot.metrics.slepi_enriched.auc_for_top_15pct_future_stress_event, 3)}
                </div>
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel-card">
          <span className="eyebrow">Freshness</span>
          <h2>Data availability</h2>
          <div className="freshness-grid">
            <SourceRow source={snapshot.dataSource} />
            <FreshnessRow label="Latest complete index" date={freshness.latest_complete_month.date} />
            <FreshnessRow label="Latest FX" date={freshness.latest_available_months.fx_market_pressure} />
            <FreshnessRow label="Latest current account" date={freshness.latest_available_months.current_account} />
            <FreshnessRow label="Latest reserves" date={freshness.latest_available_months.gross_reserves} />
            <FreshnessRow label="Latest imports" date={freshness.latest_available_months.imports} />
            <FreshnessRow label="Latest debt service (BOP)" date={freshness.latest_available_months.debt_service} />
            <FreshnessRow label="Latest portfolio flows (BOP)" date={freshness.latest_available_months.portfolio_flows} />
            <FreshnessRow label="Latest enriched index" date={freshness.latest_enriched_month?.date} />
          </div>
          {firstBlockingMonth ? (
            <p className="panel-copy subtle">
              The first month after the current complete index window is {formatMonth(firstBlockingMonth.date)}.
              It is still blocked by {firstBlockingMonth.missing_requirements.join(", ")}.
            </p>
          ) : null}
          <p className="panel-copy subtle">
            Pipeline last checked CBSL on {formatTimestamp(freshness.pipeline_checked_at)}. When
            `SLEPI_PUBLIC_DATA_BASE_URL` is configured, the app reads the latest published snapshot
            from object storage at request time, so data updates do not require a Vercel redeploy.
          </p>
        </article>
      </section>
    </main>
  );
}
