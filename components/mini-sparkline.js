export function MiniSparkline({ values }) {
  const width = 560;
  const height = 180;
  const padding = 14;

  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (cleanValues.length < 2) {
    return <div className="sparkline" />;
  }

  const min = Math.min(...cleanValues);
  const max = Math.max(...cleanValues);
  const span = max - min || 1;

  const toPoint = (value, index, length) => {
    const x = padding + (index / Math.max(length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return [x, y];
  };

  const points = values
    .map((value, index) => (Number.isFinite(value) ? toPoint(value, index, values.length) : null))
    .filter(Boolean);

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const baselineY = height - padding - ((0 - min) / span) * (height - padding * 2);

  const area = [
    `${points[0][0]},${height - padding}`,
    ...points.map(([x, y]) => `${x},${y}`),
    `${points[points.length - 1][0]},${height - padding}`,
  ].join(" ");

  const last = points[points.length - 1];

  return (
    <div className="sparkline" aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <line
          x1={padding}
          y1={baselineY}
          x2={width - padding}
          y2={baselineY}
          stroke="rgba(29, 26, 22, 0.12)"
          strokeDasharray="4 6"
        />
        <polygon points={area} fill="rgba(160, 71, 45, 0.08)" />
        <polyline
          points={line}
          stroke="#1d1a16"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last[0]} cy={last[1]} r="5.5" fill="#a0472d" />
        <circle cx={last[0]} cy={last[1]} r="11" fill="rgba(160, 71, 45, 0.16)" />
      </svg>
    </div>
  );
}
