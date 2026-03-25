"use client";

const MIN = -10;
const MAX = 15;
const BAR_HEIGHT = 16;
const BAR_Y = 40;
const BAR_LEFT = 24;
const BAR_WIDTH = 272;
const RX = 5;

const PILL_HEIGHT = 20;
const PILL_Y = 8;
const PILL_BOTTOM = PILL_Y + PILL_HEIGHT;
const GAP_CENTER = (PILL_BOTTOM + BAR_Y) / 2;
const PTR_HALF_H = 4;
const PTR_HALF_W = 5;

function valueToX(value: number) {
  const clamped = Math.max(MIN, Math.min(MAX, value));
  const t = (clamped - MIN) / (MAX - MIN);
  return BAR_LEFT + t * BAR_WIDTH;
}

const ZONE_LABELS = [
  { from: -10, to: 0,  label: "Дефицит", color: "#ef4444" },
  { from: 0,   to: 5,  label: "Граница", color: "#eab308" },
  { from: 5,   to: 15, label: "Норма",   color: "#22c55e" },
];

export function RiskGauge({
  ironIndex,
  riskPercent,
  className,
}: {
  ironIndex: number;
  riskPercent?: number | null;
  className?: string;
}) {
  const total = MAX - MIN;
  const pointerX = valueToX(ironIndex);

  const segmentColor = (v: number) => {
    if (v < 0) return "#ef4444";
    if (v < 5) return "#eab308";
    return "#22c55e";
  };
  const pillColor = segmentColor(ironIndex);

  const segments = [
    { from: -10, to: 0,  color: "#ef4444" },
    { from: 0,   to: 5,  color: "#eab308" },
    { from: 5,   to: 15, color: "#22c55e" },
  ];

  return (
    <div className={className}>
      <svg
        viewBox="0 0 320 104"
        className="w-full max-w-lg mx-auto block"
        role="img"
        aria-label={`Индекс железа: ${ironIndex.toFixed(1)}${riskPercent != null ? `, вероятность дефицита ${riskPercent}%` : ""}`}
      >
        <defs>
          <clipPath id="bar-clip">
            <rect x={BAR_LEFT} y={BAR_Y} width={BAR_WIDTH} height={BAR_HEIGHT} rx={RX}/>
          </clipPath>
        </defs>

        {/* Background track */}
        <rect
          x={BAR_LEFT} y={BAR_Y}
          width={BAR_WIDTH} height={BAR_HEIGHT}
          rx={RX} fill="#e2e8f0"
        />

        {/* Colored segments */}
        <g clipPath="url(#bar-clip)">
          {segments.map((s, i) => {
            const gap = 2;
            const x = BAR_LEFT + ((s.from - MIN) / total) * BAR_WIDTH + (i > 0 ? gap : 0);
            const w = ((s.to - s.from) / total) * BAR_WIDTH - (i > 0 ? gap : 0) - (i < 2 ? gap : 0);
            return <rect key={i} x={x} y={BAR_Y} width={w} height={BAR_HEIGHT} fill={s.color}/>;
          })}
        </g>

        {/* Zone labels under the bar */}
        {ZONE_LABELS.map((z) => {
          const midX = valueToX((z.from + z.to) / 2);
          return (
            <text
              key={z.label}
              x={midX}
              y={BAR_Y + BAR_HEIGHT + 13}
              textAnchor="middle"
              style={{ fontFamily: "system-ui, sans-serif", fontSize: 9, fill: z.color, fontWeight: 600 }}
            >
              {z.label}
            </text>
          );
        })}

        {/* Boundary tick values */}
        {[0, 5].map((v) => {
          const x = valueToX(v);
          return (
            <text
              key={v}
              x={x}
              y={BAR_Y + BAR_HEIGHT + 26}
              textAnchor="middle"
              style={{ fontFamily: "system-ui, sans-serif", fontSize: 8, fill: "#94a3b8" }}
            >
              {v}
            </text>
          );
        })}

        {/* Value pill — opaque, white text */}
        <rect
          x={pointerX - 32}
          y={PILL_Y}
          width={64}
          height={PILL_HEIGHT}
          rx={PILL_HEIGHT / 2}
          fill={pillColor}
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.18))" }}
        />
        <text
          x={pointerX}
          y={PILL_Y + PILL_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontFamily: "system-ui, sans-serif", fontSize: 10, fontWeight: 700, fill: "#ffffff", fontFeatureSettings: "'tnum'" }}
        >
          {ironIndex.toFixed(1)}
        </text>

        {/* Pointer triangle */}
        <polygon
          points={`${pointerX},${GAP_CENTER + PTR_HALF_H} ${pointerX - PTR_HALF_W},${GAP_CENTER - PTR_HALF_H} ${pointerX + PTR_HALF_W},${GAP_CENTER - PTR_HALF_H}`}
          fill="#1e293b"
        />
      </svg>

      {riskPercent != null && (
        <p className="text-center text-xs text-muted-foreground mt-1">
          Вероятность дефицита по модели: <strong>{riskPercent}%</strong>
        </p>
      )}
    </div>
  );
}
