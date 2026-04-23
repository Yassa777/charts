/* Bullet-chart gauge for a scalar metric in a bounded range.
   Shows a zone-tinted track, an optional reference marker (target/random), and the value. */

export function BulletGauge({
  label,
  value,
  min,
  max,
  good = "high", // "high" | "low"
  reference,     // numeric mid-reference (e.g. 0.5 for AUC, 0 for correlation)
  zones,         // optional [{lo, hi, fill}]
  format,        // (v) => string
}) {
  const W = 260, H = 58;
  const TRACK = { x: 2, y: 30, w: W - 4, h: 12 };
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const toX = (v) => TRACK.x + ((clamp(v) - min) / (max - min)) * TRACK.w;
  const formatted = format ? format(value) : value.toFixed(2);

  const vx = toX(value);

  const defaultZones = good === "high"
    ? [
        { lo: min,       hi: min + (max - min) * 0.5, fill: "rgba(220,38,38,0.10)" },
        { lo: min + (max - min) * 0.5, hi: min + (max - min) * 0.75, fill: "rgba(245,158,11,0.12)" },
        { lo: min + (max - min) * 0.75, hi: max, fill: "rgba(5,150,105,0.14)" },
      ]
    : [
        { lo: min, hi: min + (max - min) * 0.25, fill: "rgba(5,150,105,0.14)" },
        { lo: min + (max - min) * 0.25, hi: min + (max - min) * 0.5, fill: "rgba(245,158,11,0.12)" },
        { lo: min + (max - min) * 0.5, hi: max, fill: "rgba(220,38,38,0.10)" },
      ];

  const Z = zones ?? defaultZones;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="bullet-gauge" preserveAspectRatio="none">
      <text x={2} y={14} fontSize="11" style={{ fill: "var(--muted)" }}>
        {label}
      </text>
      <text x={W - 2} y={14} fontSize="14" fontWeight="500"
            textAnchor="end"
            style={{ fill: "var(--ink)", fontFamily: "var(--font-mono), monospace" }}>
        {formatted}
      </text>

      {/* Zone blocks */}
      {Z.map((z, i) => {
        const x1 = toX(z.lo);
        const x2 = toX(z.hi);
        return <rect key={i} x={x1} y={TRACK.y} width={x2 - x1} height={TRACK.h} fill={z.fill} />;
      })}
      {/* Track outline */}
      <rect x={TRACK.x} y={TRACK.y} width={TRACK.w} height={TRACK.h}
            fill="none" stroke="var(--line)" />

      {/* Reference marker */}
      {reference != null && (
        <line
          x1={toX(reference)} x2={toX(reference)}
          y1={TRACK.y - 3} y2={TRACK.y + TRACK.h + 3}
          stroke="var(--muted)" strokeWidth="1" strokeDasharray="2 2"
        />
      )}

      {/* Range ticks */}
      <text x={TRACK.x} y={H - 1} fontSize="9"
            style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}>
        {format ? format(min) : min}
      </text>
      <text x={W - 2} y={H - 1} fontSize="9" textAnchor="end"
            style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}>
        {format ? format(max) : max}
      </text>

      {/* Value mark */}
      <line x1={vx} x2={vx} y1={TRACK.y - 5} y2={TRACK.y + TRACK.h + 5}
            stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
