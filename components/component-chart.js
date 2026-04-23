"use client";
import { useState } from "react";
import { useHover } from "./hover-context";

const REGIME_MARKER_COLORS = {
  Acute:      "#b91c1c",
  Elevated:   "#d97706",
  Neutral:    "#64748b",
  Supportive: "#059669",
};

const SERIES = [
  { key: "reserve_block_z",                         label: "Import cover",    color: "#6366f1" },
  { key: "fx_market_pressure_z",                    label: "FX pressure",     color: "#f59e0b" },
  { key: "external_balance_pressure_adjusted_z",    label: "Ext. balance",    color: "#ec4899" },
  { key: "buffer_inflow_support_z",                 label: "Buffer inflows",  color: "#10b981" },
];

const ZONES = [
  { lo: 1.5,  hi: 2.8,  fill: "rgba(220,38,38,0.06)",    label: "Acute",      labelColor: "#dc2626" },
  { lo: 0.5,  hi: 1.5,  fill: "rgba(245,158,11,0.07)",   label: "Elevated",   labelColor: "#d97706" },
  { lo: -0.5, hi: 0.5,  fill: "rgba(100,116,139,0.04)",  label: "Neutral",    labelColor: "#64748b" },
  { lo: -2.8, hi: -0.5, fill: "rgba(5,150,105,0.06)",    label: "Supportive", labelColor: "#059669" },
];

const W = 720, H = 280;
const PAD = { top: 22, right: 120, bottom: 44, left: 48 };
const cW = W - PAD.left - PAD.right;
const cH = H - PAD.top - PAD.bottom;
const Y_MIN = -2.8, Y_MAX = 2.8;

const toX = (i, n) => PAD.left + (i / Math.max(n - 1, 1)) * cW;
const toY = (v) => PAD.top + cH - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * cH;

function regimeForScore(s) {
  if (s >= 1.5)  return "Acute";
  if (s >= 0.5)  return "Elevated";
  if (s <= -0.5) return "Supportive";
  return "Neutral";
}

/* Find regime crossings on the composite SLEPI series to place as vertical annotation lines */
function findCrossings(history) {
  const crossings = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]?.slepi_adjusted;
    const curr = history[i]?.slepi_adjusted;
    if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;
    const rPrev = regimeForScore(prev);
    const rCurr = regimeForScore(curr);
    if (rPrev !== rCurr) {
      crossings.push({ idx: i, from: rPrev, to: rCurr, date: history[i].date });
    }
  }
  return crossings;
}

export function ComponentChart({ history }) {
  const [visible, setVisible] = useState(
    () => Object.fromEntries(SERIES.map((s) => [s.key, true]))
  );
  const [hoveredCrossing, setHoveredCrossing] = useState(null);
  const { hovered } = useHover();

  if (!history || history.length < 2) return null;

  const toggle = (key) => setVisible((v) => ({ ...v, [key]: !v[key] }));
  const n = history.length;

  const monthLabel = (i) => {
    const d = new Date(history[i]?.date);
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  const xTicks = [0, Math.round(n / 3), Math.round((2 * n) / 3), n - 1];
  const yTicks = [-2, -1, 0, 1, 2];

  const crossings = findCrossings(history);

  return (
    <div className="comp-chart-outer">
      {/* Toggles */}
      <div className="comp-chart-toggles">
        {SERIES.map((s) => (
          <button
            key={s.key}
            className={`comp-toggle ${visible[s.key] ? "on" : "off"}`}
            onClick={() => toggle(s.key)}
          >
            <span
              className="toggle-swatch"
              style={{
                background: visible[s.key] ? s.color : "transparent",
                borderColor: s.color,
              }}
            />
            {s.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} fill="none" className="comp-chart-svg">
        {/* Zone bands */}
        {ZONES.map((z) => {
          const y1 = toY(Math.min(z.hi, Y_MAX));
          const y2 = toY(Math.max(z.lo, Y_MIN));
          const midY = (y1 + y2) / 2;
          return (
            <g key={z.label}>
              <rect x={PAD.left} y={y1} width={cW} height={y2 - y1} fill={z.fill} />
              <text
                x={PAD.left + 6}
                y={y1 + 11}
                fontSize="8.5"
                letterSpacing="0.08em"
                fill={z.labelColor}
                fillOpacity="0.55"
                fontFamily="var(--font-sans), sans-serif"
                fontWeight="600"
                style={{ textTransform: "uppercase" }}
              >
                {z.label}
              </text>
            </g>
          );
        })}

        {/* Y axis title */}
        <text
          x={-(PAD.top + cH / 2)}
          y={11}
          textAnchor="middle"
          transform="rotate(-90)"
          fontSize="10"
          style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}
        >
          Standardised score (z)
        </text>

        {/* Y gridlines */}
        {yTicks.map((t) => {
          const y = toY(t);
          const isZero = t === 0;
          return (
            <g key={t}>
              <line
                x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                style={{ stroke: isZero ? "var(--line-strong)" : "var(--line)" }}
                strokeWidth={isZero ? 1.5 : 1}
                strokeDasharray={isZero ? undefined : "4 6"}
              />
              <text
                x={PAD.left - 7} y={y + 4}
                textAnchor="end" fontSize="10"
                style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}
              >
                {t > 0 ? `+${t}` : t}
              </text>
              {isZero && (
                <text
                  x={W - PAD.right - 4} y={y - 4}
                  textAnchor="end" fontSize="9"
                  letterSpacing="0.08em"
                  fontWeight="600"
                  style={{ fill: "var(--muted)", fontFamily: "var(--font-sans), sans-serif", textTransform: "uppercase" }}
                >
                  neutral line
                </text>
              )}
            </g>
          );
        })}

        {/* X labels */}
        {xTicks.map((i, idx) => (
          <text
            key={i}
            x={toX(i, n)} y={H - PAD.bottom + 16}
            textAnchor={idx === xTicks.length - 1 ? "end" : idx === 0 ? "start" : "middle"}
            fontSize="10"
            style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}
          >
            {monthLabel(i)}
          </text>
        ))}

        {/* Regime-crossing markers — small dot at top, label + line on hover only */}
        {crossings.map((c) => {
          const x = toX(c.idx, n);
          const d = new Date(c.date);
          const monthLbl = isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
          const isActive = hoveredCrossing === c.idx;
          const markerColor = REGIME_MARKER_COLORS[c.to] ?? "var(--muted)";
          const tipText = `${monthLbl}  ·  ${c.from} → ${c.to}`;

          const TIP_X_MARGIN = 8;
          const TIP_W = 7 * tipText.length + 16;
          const flipLeft = x + TIP_W + TIP_X_MARGIN > W - PAD.right;
          const tipX = flipLeft ? x - TIP_X_MARGIN - TIP_W : x + TIP_X_MARGIN;

          return (
            <g
              key={c.idx}
              className="comp-chart-crossing"
              onMouseEnter={() => setHoveredCrossing(c.idx)}
              onMouseLeave={() => setHoveredCrossing(null)}
            >
              {/* Invisible hit zone */}
              <rect
                x={x - 10} y={PAD.top - 6}
                width={20} height={cH + 12}
                fill="transparent"
                style={{ cursor: "pointer" }}
              />
              {/* Dashed vertical line — only while hovered */}
              {isActive && (
                <line
                  x1={x} x2={x} y1={PAD.top} y2={PAD.top + cH}
                  stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3"
                />
              )}
              {/* Persistent mini-dot at top edge */}
              <circle cx={x} cy={PAD.top - 4} r={isActive ? 4 : 2.75} fill={markerColor} opacity={isActive ? 1 : 0.7} />
              {isActive && (
                <g>
                  <rect
                    x={tipX} y={PAD.top - 16}
                    width={TIP_W} height={20}
                    rx="4"
                    fill="var(--ink)"
                    opacity="0.95"
                  />
                  <text
                    x={tipX + TIP_W / 2} y={PAD.top - 2}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="500"
                    fill="#f8fafc"
                    fontFamily="var(--font-sans), sans-serif"
                  >
                    {tipText}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Series lines */}
        {SERIES.map((s) => {
          if (!visible[s.key]) return null;
          const pts = history
            .map((row, i) => {
              const v = row[s.key];
              return Number.isFinite(v) ? `${toX(i, n)},${toY(v)}` : null;
            })
            .filter(Boolean)
            .join(" ");

          const last = history[n - 1];
          const lv = last?.[s.key];
          const lx = toX(n - 1, n);
          const ly = Number.isFinite(lv) ? toY(lv) : null;

          const isFocused = hovered === s.key;
          const isDimmed = hovered && !isFocused;

          return (
            <g key={s.key} className={`comp-line ${isFocused ? "focus" : ""} ${isDimmed ? "dim" : ""}`}>
              <polyline
                points={pts}
                stroke={s.color}
                strokeWidth={isFocused ? 2.75 : 1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={isDimmed ? 0.18 : 1}
              />
              {ly !== null && (
                <>
                  <circle cx={lx} cy={ly} r={isFocused ? 4.5 : 3.5} fill={s.color} opacity={isDimmed ? 0.25 : 1} />
                  {/* Right-edge snapshot label */}
                  <text
                    x={lx + 8} y={ly + 3}
                    fontSize="10"
                    fontWeight="500"
                    fill={s.color}
                    fillOpacity={isDimmed ? 0.35 : 1}
                    fontFamily="var(--font-mono), monospace"
                  >
                    {lv > 0 ? "+" : ""}{lv.toFixed(2)}
                  </text>
                  <text
                    x={lx + 8} y={ly + 14}
                    fontSize="8.5"
                    letterSpacing="0.03em"
                    fill="var(--muted)"
                    fillOpacity={isDimmed ? 0.35 : 0.85}
                    fontFamily="var(--font-sans), sans-serif"
                  >
                    {s.label}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
