const ZONE_DEFS = [
  { lo: 1.5,   hi: Infinity, fill: "rgba(220,38,38,0.07)",  label: "Acute",      swatchColor: "#dc2626" },
  { lo: 0.5,   hi: 1.5,     fill: "rgba(245,158,11,0.08)", label: "Elevated",   swatchColor: "#d97706" },
  { lo: -0.5,  hi: 0.5,     fill: "rgba(100,116,139,0.05)",label: "Neutral",    swatchColor: "#94a3b8" },
  { lo: -Infinity, hi: -0.5, fill: "rgba(5,150,105,0.07)", label: "Supportive", swatchColor: "#059669" },
];

export function MiniSparkline({ values, startDate }) {
  const W = 640, H = 260;
  const PAD = { top: 20, right: 20, bottom: 44, left: 48 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <div className="chart-wrap" />;

  const dataMin = Math.min(...clean);
  const dataMax = Math.max(...clean);
  const yMin = Math.floor(Math.min(dataMin, -0.25) * 2) / 2 - 0.25;
  const yMax = Math.ceil(Math.max(dataMax, 0.25) * 2) / 2 + 0.25;
  const ySpan = yMax - yMin;

  const toX = (i) => PAD.left + (i / Math.max(values.length - 1, 1)) * cW;
  const toY = (v) => PAD.top + cH - ((v - yMin) / ySpan) * cH;

  const step = ySpan > 3 ? 1 : 0.5;
  const yTicks = [];
  const firstTick = Math.ceil(yMin / step) * step;
  for (let t = firstTick; t <= yMax + 0.001; t += step) {
    yTicks.push(Math.round(t * 100) / 100);
  }

  const n = values.length;
  const xTickIndices = [0, 6, 12, 18];
  if (n - 1 > 19) xTickIndices.push(n - 1);

  const monthLabel = (index) => {
    if (!startDate) return `M${index}`;
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + index);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  const points = values
    .map((v, i) => (Number.isFinite(v) ? [toX(i), toY(v)] : null))
    .filter(Boolean);

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const bottomY = toY(yMin);
  const area = [
    `${points[0][0]},${bottomY}`,
    ...points.map(([x, y]) => `${x},${y}`),
    `${points[points.length - 1][0]},${bottomY}`,
  ].join(" ");
  const last = points[points.length - 1];

  return (
    <div>
      <div className="chart-wrap" aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`} fill="none" xmlns="http://www.w3.org/2000/svg">
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

          {/* Y axis title */}
          <text
            x={-(PAD.top + cH / 2)}
            y={11}
            textAnchor="middle"
            transform="rotate(-90)"
            fontSize="10"
            style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}
          >
            Index score (z)
          </text>

          {/* Y gridlines + labels */}
          {yTicks.map((t) => {
            const y = toY(t);
            const isZero = Math.abs(t) < 0.001;
            return (
              <g key={t}>
                <line
                  x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  style={{ stroke: isZero ? "var(--line-strong)" : "var(--line)" }}
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

          {/* X ticks */}
          {xTickIndices.map((i) => {
            const x = toX(i);
            const isLast = i === xTickIndices[xTickIndices.length - 1];
            return (
              <g key={i}>
                <line
                  x1={x} y1={H - PAD.bottom} x2={x} y2={H - PAD.bottom + 5}
                  style={{ stroke: "var(--line)" }} strokeWidth="1"
                />
                <text
                  x={x} y={H - PAD.bottom + 18}
                  textAnchor={isLast ? "end" : "middle"} fontSize="11"
                  style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}
                >
                  {monthLabel(i)}
                </text>
              </g>
            );
          })}

          {/* Area */}
          <defs>
            <linearGradient id="spark-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.07" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#spark-area-grad)" />

          {/* Line */}
          <polyline
            points={line}
            style={{ stroke: "var(--ink)" }}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Current point */}
          <circle cx={last[0]} cy={last[1]} r="10" style={{ fill: "var(--accent)" }} fillOpacity="0.12" />
          <circle cx={last[0]} cy={last[1]} r="4" style={{ fill: "var(--accent)" }} />
        </svg>
      </div>

      {/* Zone legend */}
      <div className="chart-legend">
        {ZONE_DEFS.map((z) => (
          <span key={z.label} className="legend-item">
            <span className="legend-swatch" style={{ background: z.swatchColor, opacity: 0.5 }} />
            {z.label}
          </span>
        ))}
        <span className="legend-item legend-sep">
          <span className="legend-swatch accent" style={{ background: "var(--accent)" }} />
          Current month
        </span>
      </div>
    </div>
  );
}
