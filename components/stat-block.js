"use client";

/* Single stat card with 18-month mini sparkline. `invertColor=true` flips the
   red/green semantics (higher = good), so colour tracks "is this getting better?" */

function StatSparkline({ values, goodHigh, accent }) {
  const W = 140, H = 36;
  const PAD = 3;
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} className="stat-spark" />;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = Math.max(max - min, 0.0001);
  const n = values.length;
  const toX = (i) => PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2);
  const toY = (v) => PAD + (H - PAD * 2) * (1 - (v - min) / span);

  const pts = values
    .map((v, i) => (Number.isFinite(v) ? `${toX(i)},${toY(v)}` : null))
    .filter(Boolean)
    .join(" ");

  const first = clean[0];
  const last = clean[clean.length - 1];
  const trendUp = last > first;
  const trendIsGood = goodHigh ? trendUp : !trendUp;
  const color = trendIsGood ? "#059669" : "#dc2626";

  const lastIdx = values.length - 1;
  const lastX = toX(lastIdx);
  const lastY = toY(last);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="stat-spark">
      <polyline points={pts} fill="none" stroke={accent ?? color} strokeWidth="1.4"
                strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={lastX} cy={lastY} r="2.2" fill={color} />
    </svg>
  );
}

export function StatBlock({
  label,
  value,
  unit,
  previous,
  current,
  invertColor,
  history,
  anchor,
}) {
  const hasPrev = previous !== undefined && previous !== null && Number.isFinite(previous);
  let delta = null, badgeClass = null;
  if (hasPrev) {
    delta = current - previous;
    const isUp = delta > 0;
    const isBad = invertColor ? !isUp : isUp;
    badgeClass = Math.abs(delta) < 0.04 ? null : (isBad ? "bad" : "good");
  }

  return (
    <div className={`stat-block ${anchor ? "stat-block-anchor" : ""}`}>
      <span className="stat-label">{label}</span>
      <div className="stat-value-row">
        <span className="stat-value">{value}</span>
        {badgeClass && (
          <span className={`mom-badge ${badgeClass}`}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}
          </span>
        )}
      </div>
      <StatSparkline values={history.map((r) => r[historyKey(label)])} goodHigh={!!invertColor} />
      <span className="stat-unit">{unit}</span>
    </div>
  );
}

function historyKey(label) {
  switch (label) {
    case "USD / LKR":          return "usd_lkr";
    case "Usable cover":       return "adjusted_usable_reserve_cover_months";
    case "ST debt / reserves": return "short_term_external_debt_to_reserves_raw";
    case "Current account":    return "current_account_filled_usd_m";
    case "Balance signal":     return "current_account_filled_usd_m";
    case "Trade balance":      return "trade_balance_usd_m";
    case "Services balance":   return "services_balance_usd_m";
    case "M2b / reserves":     return "m2b_to_adjusted_reserves_raw";
    default: return null;
  }
}
