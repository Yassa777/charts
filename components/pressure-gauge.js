"use client";
import { useEffect, useState } from "react";

const CX = 150, CY = 138, R = 108;

function getNeedleColor(score) {
  if (score >= 1.5) return "var(--critical)";
  if (score >= 0.5) return "var(--pressure)";
  if (score <= -0.5) return "var(--support)";
  return "var(--muted)";
}

export function PressureGauge({ score }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const clamped = Math.max(-2, Math.min(2, score ?? 0));
  const angle = (clamped / 2) * 90;
  const color = getNeedleColor(score ?? 0);
  const isPressured = (score ?? 0) >= 0.5;
  const displayScore = score != null ? score.toFixed(2) : "—";

  // Tick marks at -2, -1, 0, +1, +2 mapped to angles -90, -45, 0, +45, +90
  const ticks = [-2, -1, 0, 1, 2];

  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 300 190" className="gauge-svg" aria-label={`SLEPI score: ${displayScore}`}>
        <defs>
          <linearGradient id="gauge-track-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="var(--support)"  stopOpacity="0.45" />
            <stop offset="40%"  stopColor="var(--muted)"    stopOpacity="0.15" />
            <stop offset="60%"  stopColor="var(--muted)"    stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--pressure)" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {/* Track arc */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="url(#gauge-track-grad)"
          strokeWidth="11"
          strokeLinecap="round"
        />

        {/* Scale ticks + labels */}
        {ticks.map((t) => {
          const tickAngle = ((t / 2) * 90 * Math.PI) / 180;
          // Tick goes from arc inward
          const sin = Math.sin(tickAngle - Math.PI / 2); // rotate -90 so 0 points up
          const cos = Math.cos(tickAngle - Math.PI / 2);
          // Correct: at t=0, needle points up (negative Y from center)
          const outerR = R + 4;
          const innerR = R - 8;
          const labelR = R - 22;
          return (
            <g key={t}>
              <line
                x1={CX + cos * innerR} y1={CY + sin * innerR}
                x2={CX + cos * outerR} y2={CY + sin * outerR}
                stroke="currentColor"
                strokeOpacity="0.22"
                strokeWidth={t === 0 ? 2 : 1}
                strokeLinecap="round"
              />
              <text
                x={CX + cos * labelR}
                y={CY + sin * labelR + 4}
                textAnchor="middle"
                fontSize="9"
                fontFamily="monospace"
                fill="currentColor"
                fillOpacity="0.38"
              >
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          );
        })}

        {/* Needle shadow */}
        <g style={{
          transformOrigin: `${CX}px ${CY}px`,
          transform: `rotate(${mounted ? angle : 0}deg)`,
          transition: mounted ? "transform 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
        }}>
          <line x1={CX} y1={CY + 4} x2={CX} y2={CY - R + 12}
            stroke="rgba(0,0,0,0.12)" strokeWidth="5" strokeLinecap="round" />
        </g>

        {/* Needle */}
        <g style={{
          transformOrigin: `${CX}px ${CY}px`,
          transform: `rotate(${mounted ? angle : 0}deg)`,
          transition: mounted ? "transform 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
        }}>
          <line x1={CX} y1={CY} x2={CX} y2={CY - R + 12}
            stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* Pivot */}
        <circle cx={CX} cy={CY} r="7" fill={color} className={isPressured ? "gauge-pivot-pulse" : ""} />
        <circle cx={CX} cy={CY} r="2.8" fill="rgba(255,252,247,0.85)" />

        {/* Score */}
        <text
          x={CX} y={CY + 42}
          textAnchor="middle"
          fontSize="40"
          fontWeight="600"
          fill="currentColor"
          letterSpacing="-2"
          fontFamily="Georgia, serif"
        >
          {displayScore}
        </text>
      </svg>
    </div>
  );
}
