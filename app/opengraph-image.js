import { ImageResponse } from "next/og";
import { getSlepiSnapshot, formatMonth, formatNumber } from "@/lib/slepi";
import { SITE_DESCRIPTION, SITE_FULL_TITLE, SITE_ORGANIZATION } from "@/lib/site";
import { HEADLINE_DEFINITION } from "@/lib/methodology";
import { getRegime, regimeLabel, regimeColor } from "@/components/regime";

export const alt = "SLEPI live score and 24-month pressure chart";
export const size = {
  width: 1200,
  height: 627,
};
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const CHART = {
  width: 710,
  height: 288,
  left: 58,
  right: 18,
  top: 28,
  bottom: 42,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreLabel(value) {
  if (!Number.isFinite(value)) return "n/a";
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function trendLabel(delta) {
  if (!Number.isFinite(delta)) return "No previous month comparison";
  if (Math.abs(delta) < 0.01) return "Unchanged vs previous month";
  return `${delta > 0 ? "Deteriorated" : "Improved"} ${Math.abs(delta).toFixed(2)} vs previous month`;
}

function dateRange(start, end) {
  if (!start || !end) return "Recent history";
  return `${formatMonth(start)} to ${formatMonth(end)}`;
}

function chartGeometry(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) {
    return null;
  }

  const dataMin = Math.min(...finite);
  const dataMax = Math.max(...finite);
  const yMin = Math.floor(Math.min(dataMin, -0.5) * 2) / 2 - 0.25;
  const yMax = Math.ceil(Math.max(dataMax, 0.5) * 2) / 2 + 0.25;
  const ySpan = Math.max(0.5, yMax - yMin);
  const innerWidth = CHART.width - CHART.left - CHART.right;
  const innerHeight = CHART.height - CHART.top - CHART.bottom;
  const n = values.length;

  const toX = (index) => CHART.left + (index / Math.max(n - 1, 1)) * innerWidth;
  const toY = (value) => CHART.top + innerHeight - ((value - yMin) / ySpan) * innerHeight;

  const points = values.map((value, index) => [toX(index), toY(value)]);
  const linePath = `M ${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")}`;
  const zeroY = clamp(toY(0), CHART.top, CHART.top + innerHeight);
  const last = points[points.length - 1];

  return {
    yMin,
    yMax,
    zeroY,
    last,
    linePath,
    chartBottom: CHART.top + innerHeight,
    chartRight: CHART.left + innerWidth,
  };
}

function MethodPill({ children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        border: "1px solid rgba(15,23,42,0.13)",
        borderRadius: 999,
        padding: "8px 13px",
        color: "#475569",
        backgroundColor: "rgba(255,255,255,0.74)",
        fontSize: 18,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export default async function OpenGraphImage() {
  const snapshot = await getSlepiSnapshot();
  const latest = snapshot.latest ?? {};
  const score = latest.slepi_adjusted;
  const regime = getRegime(score);
  const color = regimeColor(regime);
  const values = (snapshot.sparklineValues ?? []).filter(Number.isFinite);
  const chart = chartGeometry(values);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "46px 54px",
          background: "linear-gradient(135deg, #f8fafc 0%, #eef2f7 48%, #fff7ed 100%)",
          color: "#0f172a",
          fontFamily: "Arial",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 420,
            height: 420,
            borderRadius: 999,
            right: -110,
            top: -150,
            background: "rgba(16,185,129,0.10)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 320,
            height: 320,
            borderRadius: 999,
            left: -120,
            bottom: -150,
            background: "rgba(245,158,11,0.12)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", color: "#64748b", fontSize: 22, fontWeight: 700 }}>
              SRI LANKA EXTERNAL PRESSURE INDEX
            </div>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 760, color: "#0f172a" }}>{SITE_FULL_TITLE}</div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "11px 16px",
              borderRadius: 999,
              color,
              backgroundColor: "rgba(255,255,255,0.76)",
              border: `2px solid ${color}33`,
              fontSize: 22,
              fontWeight: 760,
            }}
          >
            {regimeLabel(regime)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 36, marginTop: 38, alignItems: "stretch" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 330,
              borderRadius: 28,
              padding: "32px 34px",
              backgroundColor: "rgba(255,255,255,0.82)",
              border: "1px solid rgba(15,23,42,0.10)",
              boxShadow: "0 24px 60px rgba(15,23,42,0.10)",
            }}
          >
            <div style={{ display: "flex", color: "#64748b", fontSize: 21, fontWeight: 700 }}>Latest score</div>
            <div style={{ display: "flex", color, fontSize: 108, fontWeight: 800, lineHeight: 1, marginTop: 8 }}>
              {scoreLabel(score)}
            </div>
            <div style={{ display: "flex", color: "#334155", fontSize: 28, fontWeight: 700, marginTop: 14 }}>
              {latest.date ? formatMonth(latest.date) : "Latest month"}
            </div>
            <div style={{ display: "flex", color: "#64748b", fontSize: 20, marginTop: 20, lineHeight: 1.35 }}>
              {trendLabel(snapshot.delta)}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              borderRadius: 28,
              padding: "28px 30px 24px",
              backgroundColor: "rgba(255,255,255,0.82)",
              border: "1px solid rgba(15,23,42,0.10)",
              boxShadow: "0 24px 60px rgba(15,23,42,0.10)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", color: "#0f172a", fontSize: 28, fontWeight: 760 }}>24-month pressure path</div>
              <div style={{ display: "flex", color: "#64748b", fontSize: 19, fontWeight: 650 }}>
                {dateRange(snapshot.sparklineStart, snapshot.sparklineEnd)}
              </div>
            </div>

            <svg width={CHART.width} height={CHART.height - 28} viewBox={`0 0 ${CHART.width} ${CHART.height - 28}`} style={{ marginTop: 12 }}>
              <defs>
                <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#64748b" />
                  <stop offset="100%" stopColor={color} />
                </linearGradient>
              </defs>
              <rect x={CHART.left} y={CHART.top} width={CHART.width - CHART.left - CHART.right} height={CHART.height - CHART.top - CHART.bottom} rx="12" fill="#f8fafc" />
              {chart && (
                <g>
                  <rect x={CHART.left} y={CHART.top} width={CHART.width - CHART.left - CHART.right} height={Math.max(0, chart.zeroY - CHART.top)} fill="rgba(220,38,38,0.075)" />
                  <rect x={CHART.left} y={chart.zeroY} width={CHART.width - CHART.left - CHART.right} height={Math.max(0, chart.chartBottom - chart.zeroY)} fill="rgba(5,150,105,0.075)" />
                  <line x1={CHART.left} x2={chart.chartRight} y1={chart.zeroY} y2={chart.zeroY} stroke="#94a3b8" strokeWidth="2" strokeDasharray="7 8" />
                  <path d={chart.linePath} fill="none" stroke="url(#lineGlow)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={chart.last[0]} cy={chart.last[1]} r="14" fill="#ffffff" stroke={color} strokeWidth="7" />
                </g>
              )}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginLeft: CHART.left, marginRight: CHART.right, marginTop: -4 }}>
              <div style={{ display: "flex", color: "#64748b", fontSize: 18, fontWeight: 650 }}>
                {snapshot.sparklineStart ? formatMonth(snapshot.sparklineStart) : ""}
              </div>
              <div style={{ display: "flex", color: "#64748b", fontSize: 18, fontWeight: 650 }}>
                0 line separates pressure from support
              </div>
              <div style={{ display: "flex", color: "#64748b", fontSize: 18, fontWeight: 650 }}>
                {snapshot.sparklineEnd ? formatMonth(snapshot.sparklineEnd) : ""}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <MethodPill>Equal-weighted z-score index</MethodPill>
            <MethodPill>Reserves</MethodPill>
            <MethodPill>FX</MethodPill>
            <MethodPill>External financing</MethodPill>
            <MethodPill>External balance</MethodPill>
          </div>
          <div style={{ display: "flex", color: "#475569", fontSize: 22, fontWeight: 700 }}>
            {SITE_ORGANIZATION.name}
          </div>
        </div>

        <div style={{ display: "flex", color: "#64748b", fontSize: 18, lineHeight: 1.25, marginTop: 18 }}>
          {SITE_DESCRIPTION} {HEADLINE_DEFINITION}
        </div>
      </div>
    ),
    size
  );
}
