"use client";
import { useHover } from "./hover-context";
import { ComponentGlyph } from "./component-glyph";

/* Mini small-multiple of one component's z-score over time.
   Regime-tinted above/below the zero line. Highlighted state adds a gradient fill. */
function MiniTrend({ values, color, highlighted }) {
  const W = 180, H = 46;
  const PAD = { top: 4, right: 4, bottom: 4, left: 4 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} />;

  const absMax = Math.max(2, ...clean.map((v) => Math.abs(v)));
  const yMin = -absMax;
  const yMax = absMax;
  const n = values.length;
  const toX = (i) => PAD.left + (i / Math.max(n - 1, 1)) * cW;
  const toY = (v) => PAD.top + cH - ((v - yMin) / (yMax - yMin)) * cH;
  const zeroY = toY(0);

  const points = values
    .map((v, i) => (Number.isFinite(v) ? [toX(i), toY(v)] : null))
    .filter(Boolean);

  const linePath = "M " + points.map(([x, y]) => `${x} ${y}`).join(" L ");
  const last = points[points.length - 1];
  const lastValue = values[values.length - 1];
  const lastPositive = Number.isFinite(lastValue) && lastValue > 0;

  const gid = `mtf-${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mini-trend">
      <defs>
        <linearGradient id={`${gid}-up`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" stopOpacity={highlighted ? 0.35 : 0.18} />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${gid}-dn`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#059669" stopOpacity={highlighted ? 0.35 : 0.18} />
          <stop offset="100%" stopColor="#059669" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${gid}-above`}>
          <rect x="0" y="0" width={W} height={zeroY} />
        </clipPath>
        <clipPath id={`${gid}-below`}>
          <rect x="0" y={zeroY} width={W} height={H - zeroY} />
        </clipPath>
      </defs>

      {/* Zone band tint */}
      <rect x="0" y="0" width={W} height={zeroY} fill="rgba(220,38,38,0.04)" />
      <rect x="0" y={zeroY} width={W} height={H - zeroY} fill="rgba(5,150,105,0.04)" />

      {/* Zero line */}
      <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY}
            stroke="var(--line-strong)" strokeWidth="0.75" strokeDasharray="2 3" />

      {/* Area fills (two-tone, clipped) */}
      <path d={`${linePath} L ${last[0]} ${zeroY} L ${points[0][0]} ${zeroY} Z`}
            fill={`url(#${gid}-up)`} clipPath={`url(#${gid}-above)`} />
      <path d={`${linePath} L ${last[0]} ${zeroY} L ${points[0][0]} ${zeroY} Z`}
            fill={`url(#${gid}-dn)`} clipPath={`url(#${gid}-below)`} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={color}
            strokeWidth={highlighted ? 2 : 1.5}
            strokeLinecap="round" strokeLinejoin="round"
            opacity={highlighted ? 1 : 0.85} />

      {/* Last point */}
      <circle cx={last[0]} cy={last[1]} r={highlighted ? 3.5 : 2.5}
              fill={lastPositive ? "#dc2626" : "#059669"} />
    </svg>
  );
}

function InfoIcon({ text }) {
  return (
    <span className="info-icon">
      i<span className="info-tooltip">{text}</span>
    </span>
  );
}

function MomBadge({ current, previous, invertColor }) {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.04) return null;
  const isUp = delta > 0;
  const isBad = invertColor ? !isUp : isUp;
  return (
    <span className={`mom-badge ${isBad ? "bad" : "good"}`}>
      {isUp ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}
    </span>
  );
}

export function ComponentRow({
  componentKey,
  glyph,
  title,
  score,
  prevScore,
  value,
  unit,
  description,
  history,
  color,
}) {
  const { hovered, setHovered } = useHover();
  const isHovered = hovered === componentKey;
  const isDimmed = hovered && !isHovered;
  const isPositive = score >= 0;
  const dir = isPositive ? "pressure" : "support";

  return (
    <div
      className={`comp-row ${isHovered ? "is-hover" : ""} ${isDimmed ? "is-dim" : ""}`}
      onMouseEnter={() => setHovered(componentKey)}
      onMouseLeave={() => setHovered(null)}
      data-component={componentKey}
    >
      <div className="comp-name">
        <span className="comp-glyph" style={{ color }}>
          <ComponentGlyph kind={glyph} size={18} />
        </span>
        <span className="comp-name-text">{title}</span>
        <InfoIcon text={description} />
      </div>
      <div className="comp-value-block">
        <span className="comp-value">{value}</span>
        <span className="comp-unit">{unit}</span>
      </div>
      <div className="comp-trend-wrap">
        <MiniTrend values={history} color={color} highlighted={isHovered} />
      </div>
      <div className="comp-zscore-wrap">
        <span className={`comp-zscore ${dir}`}>
          {isPositive ? "+" : ""}{score.toFixed(2)}
        </span>
        <MomBadge current={score} previous={prevScore} />
      </div>
    </div>
  );
}
