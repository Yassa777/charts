/* Horizontal regime ribbon — scale from −2 to +2 with zones and a tick at the current score.
   Anchors the abstract z-score to a visual range. */

const W = 320, H = 44;
const PAD_X = 4;

export function RegimeRibbon({ score }) {
  const min = -2, max = 2;
  const clamped = Math.max(min, Math.min(max, Number.isFinite(score) ? score : 0));
  const scaleW = W - PAD_X * 2;
  const toX = (v) => PAD_X + ((v - min) / (max - min)) * scaleW;

  const zones = [
    { lo: -2,   hi: -0.5, fill: "rgba(5, 150, 105, 0.14)",   label: "Supportive" },
    { lo: -0.5, hi: 0.5,  fill: "rgba(100, 116, 139, 0.10)", label: "Calm" },
    { lo: 0.5,  hi: 1.5,  fill: "rgba(245, 158, 11, 0.18)",  label: "Elevated" },
    { lo: 1.5,  hi: 2,    fill: "rgba(220, 38, 38, 0.22)",   label: "Acute" },
  ];

  const trackY = 20;
  const trackH = 8;
  const tickX = toX(clamped);

  return (
    <div className="regime-ribbon-wrap" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className="regime-ribbon-svg">
        {/* Zone bar */}
        {zones.map((z) => {
          const x1 = toX(z.lo);
          const x2 = toX(z.hi);
          return (
            <rect
              key={z.label}
              x={x1}
              y={trackY}
              width={x2 - x1}
              height={trackH}
              fill={z.fill}
            />
          );
        })}
        {/* Track outline */}
        <rect
          x={PAD_X}
          y={trackY}
          width={scaleW}
          height={trackH}
          fill="none"
          stroke="var(--line)"
          rx="2"
        />
        {/* Tick marks */}
        {[-2, -1, 0, 1, 2].map((t) => {
          const x = toX(t);
          return (
            <g key={t}>
              <line
                x1={x}
                x2={x}
                y1={trackY - 3}
                y2={trackY + trackH + 3}
                stroke="var(--line-strong)"
                strokeWidth={t === 0 ? 1.2 : 0.7}
              />
              <text
                x={x}
                y={H - 2}
                textAnchor="middle"
                fontSize="9"
                style={{ fill: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}
              >
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          );
        })}
        {/* Current marker */}
        <g>
          <line
            x1={tickX}
            x2={tickX}
            y1={trackY - 6}
            y2={trackY + trackH + 6}
            stroke="var(--regime-color)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx={tickX} cy={trackY + trackH / 2} r="4" fill="var(--regime-color)" />
          <circle cx={tickX} cy={trackY + trackH / 2} r="7" fill="var(--regime-color)" fillOpacity="0.18" />
        </g>
        {/* Current label */}
        <text
          x={tickX}
          y={trackY - 8}
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="600"
          style={{ fill: "var(--regime-strong)", fontFamily: "var(--font-mono), monospace" }}
        >
          {clamped > 0 ? "+" : ""}{clamped.toFixed(2)}
        </text>
      </svg>
    </div>
  );
}
