"use client";
import { useEffect, useRef, useState } from "react";
import { getRegime } from "./regime";

const ZONE_DEFS = [
  { lo: 1.5,   hi: Infinity, fill: "rgba(220,38,38,0.09)",  label: "Acute",      swatchColor: "#dc2626" },
  { lo: 0.5,   hi: 1.5,     fill: "rgba(245,158,11,0.10)", label: "Elevated",   swatchColor: "#d97706" },
  { lo: -0.5,  hi: 0.5,     fill: "rgba(100,116,139,0.05)",label: "Neutral",    swatchColor: "#94a3b8" },
  { lo: -Infinity, hi: -0.5, fill: "rgba(5,150,105,0.09)", label: "Supportive", swatchColor: "#059669" },
];

function fmtMonth(d) {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function fmtMonthLong(d) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function parseDate(s) {
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function HeroChart({ history, crisisPeakDate }) {
  const clean = (history ?? []).filter((p) => Number.isFinite(p.score));
  const [hoverIdx, setHoverIdx] = useState(null);
  const [mounted, setMounted] = useState(false);
  const svgRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  if (clean.length < 2) return <div className="chart-wrap" />;

  const W = 640, H = 280;
  const PAD = { top: 22, right: 20, bottom: 44, left: 48 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const scores = clean.map((p) => p.score);
  const dataMin = Math.min(...scores);
  const dataMax = Math.max(...scores);
  const yMin = Math.floor(Math.min(dataMin, -0.5) * 2) / 2 - 0.25;
  const yMax = Math.ceil(Math.max(dataMax, 0.5) * 2) / 2 + 0.25;
  const ySpan = yMax - yMin;

  const n = clean.length;
  const toX = (i) => PAD.left + (i / Math.max(n - 1, 1)) * cW;
  const toY = (v) => PAD.top + cH - ((v - yMin) / ySpan) * cH;

  const step = ySpan > 3 ? 1 : 0.5;
  const yTicks = [];
  const firstTick = Math.ceil(yMin / step) * step;
  for (let t = firstTick; t <= yMax + 0.001; t += step) {
    yTicks.push(Math.round(t * 100) / 100);
  }

  /* X ticks — ~5 evenly spread, prefer January of each year if visible */
  const xTickIndices = [];
  const step5 = Math.max(1, Math.floor((n - 1) / 5));
  for (let i = 0; i < n; i += step5) xTickIndices.push(i);
  if (xTickIndices[xTickIndices.length - 1] !== n - 1) xTickIndices.push(n - 1);

  const points = clean.map((p, i) => [toX(i), toY(p.score)]);
  const linePath = "M " + points.map(([x, y]) => `${x} ${y}`).join(" L ");
  const bottomY = toY(yMin);
  const areaPath =
    `M ${points[0][0]} ${bottomY} ` +
    points.map(([x, y]) => `L ${x} ${y}`).join(" ") +
    ` L ${points[n - 1][0]} ${bottomY} Z`;

  const last = points[n - 1];
  const lastScore = clean[n - 1].score;
  const lastRegime = getRegime(lastScore);

  /* Crisis peak — if inside window */
  let crisisIdx = null;
  const crisisDate = parseDate(crisisPeakDate);
  if (crisisDate) {
    for (let i = 0; i < n; i++) {
      const d = parseDate(clean[i].date);
      if (d && d.getFullYear() === crisisDate.getFullYear() && d.getMonth() === crisisDate.getMonth()) {
        crisisIdx = i;
        break;
      }
    }
  }

  /* Hover — nearest index to mouse x */
  function onMove(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xLocal = ((e.clientX - rect.left) / rect.width) * W;
    if (xLocal < PAD.left || xLocal > W - PAD.right) { setHoverIdx(null); return; }
    const frac = (xLocal - PAD.left) / cW;
    const idx = Math.round(frac * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  }

  const h = hoverIdx != null ? hoverIdx : null;
  const hPt = h != null ? points[h] : null;
  const hRow = h != null ? clean[h] : null;

  return (
    <div className="hero-chart-wrap">
      <div className="chart-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
          className="hero-chart-svg"
        >
          <defs>
            <linearGradient id="hero-area-pressure" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--regime-color)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--regime-color)" stopOpacity="0" />
            </linearGradient>
            <clipPath id="hero-clip-above">
              <rect x={PAD.left} y={PAD.top} width={cW} height={toY(0) - PAD.top} />
            </clipPath>
            <clipPath id="hero-clip-below">
              <rect x={PAD.left} y={toY(0)} width={cW} height={(PAD.top + cH) - toY(0)} />
            </clipPath>
            <linearGradient id="hero-fill-up" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dc2626" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="hero-fill-down" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Zone bands */}
          {ZONE_DEFS.map((z) => {
            const bandTop = Math.min(z.hi, yMax);
            const bandBot = Math.max(z.lo, yMin);
            if (bandTop <= bandBot) return null;
            const y1 = toY(bandTop);
            const y2 = toY(bandBot);
            return (
              <rect key={z.label} x={PAD.left} y={y1} width={cW} height={y2 - y1} fill={z.fill} />
            );
          })}

          {/* Gridlines */}
          {yTicks.map((t) => {
            const y = toY(t);
            const isZero = Math.abs(t) < 0.001;
            return (
              <g key={t}>
                <line
                  x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  stroke={isZero ? "var(--line-strong)" : "var(--line)"}
                  strokeDasharray={isZero ? undefined : "4 6"}
                  strokeWidth={isZero ? 1.5 : 1}
                />
                <text
                  x={PAD.left - 8} y={y + 4}
                  textAnchor="end" fontSize="11"
                  style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}
                >
                  {t === 0 ? "0" : t.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* X labels */}
          {xTickIndices.map((i, idx) => {
            const x = toX(i);
            const d = parseDate(clean[i].date);
            const isLast = idx === xTickIndices.length - 1;
            return (
              <g key={i}>
                <line
                  x1={x} y1={H - PAD.bottom} x2={x} y2={H - PAD.bottom + 4}
                  stroke="var(--line)" strokeWidth="1"
                />
                <text
                  x={x} y={H - PAD.bottom + 18}
                  textAnchor={isLast ? "end" : idx === 0 ? "start" : "middle"}
                  fontSize="11"
                  style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}
                >
                  {d ? fmtMonth(d) : ""}
                </text>
              </g>
            );
          })}

          {/* Two-tone area fill: red above zero, green below zero */}
          <path d={areaPath} fill="url(#hero-fill-up)" clipPath="url(#hero-clip-above)" className="hero-area" />
          <path d={areaPath} fill="url(#hero-fill-down)" clipPath="url(#hero-clip-below)" className="hero-area" />

          {/* Line — stroked with draw-in animation */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={`hero-line ${mounted ? "in" : ""}`}
          />

          {/* Crisis peak annotation */}
          {crisisIdx != null && crisisIdx !== n - 1 && (() => {
            const [cx, cy] = points[crisisIdx];
            const labelAbove = cy > PAD.top + 40;
            const ly = labelAbove ? cy - 16 : cy + 22;
            return (
              <g className="hero-annotation">
                <circle cx={cx} cy={cy} r="4.5" fill="#8a1538" />
                <circle cx={cx} cy={cy} r="9" fill="#8a1538" fillOpacity="0.18" />
                <line x1={cx} x2={cx} y1={cy + (labelAbove ? -8 : 8)} y2={ly + (labelAbove ? 2 : -8)} stroke="#8a1538" strokeWidth="1" strokeDasharray="2 3" />
                <text
                  x={cx} y={ly}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  style={{ fill: "#8a1538", fontFamily: "var(--font-sans), sans-serif" }}
                >
                  2022 crisis peak
                </text>
              </g>
            );
          })()}

          {/* Current point */}
          <circle cx={last[0]} cy={last[1]} r="10" fill="var(--regime-color)" fillOpacity="0.18" />
          <circle cx={last[0]} cy={last[1]} r="4" fill="var(--regime-color)" />

          {/* Hover indicator */}
          {hPt && (
            <g className="hero-hover">
              <line
                x1={hPt[0]} x2={hPt[0]}
                y1={PAD.top} y2={PAD.top + cH}
                stroke="var(--ink)" strokeWidth="1" strokeDasharray="2 3" strokeOpacity="0.35"
              />
              <circle cx={hPt[0]} cy={hPt[1]} r="4.5" fill="var(--ink)" />
              <circle cx={hPt[0]} cy={hPt[1]} r="2" fill="#fff" />
            </g>
          )}
        </svg>
      </div>

      {/* Readout strip */}
      <div className="hero-chart-readout">
        {hRow ? (
          <>
            <span className="hero-readout-month">{fmtMonthLong(parseDate(hRow.date))}</span>
            <span className="hero-readout-score" data-regime={getRegime(hRow.score)}>
              {hRow.score > 0 ? "+" : ""}{hRow.score.toFixed(2)}
            </span>
          </>
        ) : (
          <>
            <span className="hero-readout-hint">Hover to scrub history</span>
            <span className="hero-readout-score" data-regime={lastRegime}>
              Latest {lastScore > 0 ? "+" : ""}{lastScore.toFixed(2)}
            </span>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="chart-legend">
        {ZONE_DEFS.map((z) => (
          <span key={z.label} className="legend-item">
            <span className="legend-swatch" style={{ background: z.swatchColor, opacity: 0.55 }} />
            {z.label}
          </span>
        ))}
        <span className="legend-item legend-sep">
          <span className="legend-swatch" style={{ background: "#8a1538" }} />
          2022 crisis peak
        </span>
      </div>
    </div>
  );
}
