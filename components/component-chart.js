"use client";
import { useState } from "react";

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

const W = 640, H = 240;
const PAD = { top: 20, right: 80, bottom: 40, left: 48 };
const cW = W - PAD.left - PAD.right;
const cH = H - PAD.top - PAD.bottom;
const Y_MIN = -2.8, Y_MAX = 2.8;

const toX = (i, n) => PAD.left + (i / Math.max(n - 1, 1)) * cW;
const toY = (v) => PAD.top + cH - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * cH;

export function ComponentChart({ history }) {
  const [visible, setVisible] = useState(
    () => Object.fromEntries(SERIES.map((s) => [s.key, true]))
  );

  if (!history || history.length < 2) return null;

  const toggle = (key) => setVisible((v) => ({ ...v, [key]: !v[key] }));
  const n = history.length;

  const monthLabel = (i) => {
    const d = new Date(history[i]?.date);
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  const xTicks = [0, Math.round(n / 3), Math.round((2 * n) / 3), n - 1];
  const yTicks = [-2, -1, 0, 1, 2];

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
                x={W - PAD.right + 8}
                y={midY + 4}
                fontSize="9"
                fill={z.labelColor}
                fillOpacity="0.8"
                fontFamily="var(--font-sans), sans-serif"
                fontWeight="500"
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

          return (
            <g key={s.key}>
              <polyline
                points={pts}
                stroke={s.color}
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {ly !== null && (
                <circle cx={lx} cy={ly} r="3.5" fill={s.color} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
