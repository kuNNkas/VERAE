"use client";

const MIN = -10;
const MAX = 15;
const BAR_HEIGHT = 10;
const BAR_Y = 36;
const BAR_LEFT = 24;
const BAR_WIDTH = 272;
const RX = 4;

const PILL_HEIGHT = 16;
const PILL_Y = 5;
const PILL_BOTTOM = PILL_Y + PILL_HEIGHT;
const GAP_CENTER = (PILL_BOTTOM + BAR_Y) / 2;
const PTR_HALF_H = 3.5;
const PTR_HALF_W = 4;

function valueToX(value: number) {
  const clamped = Math.max(MIN, Math.min(MAX, value));
  const t = (clamped - MIN) / (MAX - MIN);
  return BAR_LEFT + t * BAR_WIDTH;
}

export function RiskGauge({
  ironIndex,
  riskPercent,
  className,
}: {
  ironIndex: number;
  riskPercent?: number | null;
  className?: string;
}) {
  const pointerX = valueToX(ironIndex);
  const total = MAX - MIN;

  const segmentForValue = (v: number) => {
    if (v < 0) return "#ef4444";
    if (v < 5) return "#eab308";
    return "#22c55e";
  };
  const pillColor = segmentForValue(ironIndex);

  const segments = [
    { from: -10, to: 0,  color: "#ef4444" },
    { from: 0,   to: 5,  color: "#eab308" },
    { from: 5,   to: 15, color: "#22c55e" },
  ];

  return (
    <div className={className}>
      <svg
        viewBox="0 0 320 70"
        className="w-full max-w-lg mx-auto block"
        aria-hidden
      >
        <defs>
          <filter id="ptr-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
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

        {/* Colored segments clipped to rounded track */}
        <g clipPath="url(#bar-clip)">
          {segments.map((s, i) => {
            const gap = 2;
            const x = BAR_LEFT + ((s.from - MIN) / total) * BAR_WIDTH + (i > 0 ? gap : 0);
            const w = ((s.to - s.from) / total) * BAR_WIDTH - (i > 0 ? gap : 0) - (i < 2 ? gap : 0);
            return (
              <rect key={i} x={x} y={BAR_Y} width={w} height={BAR_HEIGHT} fill={s.color}/>
            );
          })}
        </g>

        {/* Value pill: высота в 2 раза меньше, фон — цвет сегмента с 50% прозрачностью */}
        <rect
          x={pointerX - 30}
          y={PILL_Y}
          width={60}
          height={PILL_HEIGHT}
          rx={PILL_HEIGHT / 2}
          fill={pillColor}
          fillOpacity={0.5}
          stroke="#e2e8f0"
          strokeWidth="1.5"
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.10))" }}
        />
        <g transform={`translate(${pointerX}, ${PILL_Y + PILL_HEIGHT / 2})`}>
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[10px] font-bold fill-foreground"
            style={{ fontFamily: "system-ui, sans-serif", fontFeatureSettings: "'tnum'", fontSize: 10 }}
          >
            {ironIndex.toFixed(1)}
          </text>
        </g>

        {/* Стрелка: меньше, ровно посередине между таблеткой и полосой */}
        <polygon
          points={`${pointerX},${GAP_CENTER + PTR_HALF_H} ${pointerX - PTR_HALF_W},${GAP_CENTER - PTR_HALF_H} ${pointerX + PTR_HALF_W},${GAP_CENTER - PTR_HALF_H}`}
          fill="#1e293b"
          filter="url(#ptr-glow)"
        />

        {/* Scale labels: −10, 0, 5, 15 */}
        <text
          x={BAR_LEFT}
          y={BAR_Y + BAR_HEIGHT + 14}
          textAnchor="start"
          className="text-[10px] fill-muted-foreground"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          −10
        </text>
        <text
          x={valueToX(0)}
          y={BAR_Y + BAR_HEIGHT + 14}
          textAnchor="middle"
          className="text-[10px] fill-muted-foreground"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          0
        </text>
        <text
          x={valueToX(5)}
          y={BAR_Y + BAR_HEIGHT + 14}
          textAnchor="middle"
          className="text-[10px] fill-muted-foreground"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          5
        </text>
        <text
          x={BAR_LEFT + BAR_WIDTH}
          y={BAR_Y + BAR_HEIGHT + 14}
          textAnchor="end"
          className="text-[10px] fill-muted-foreground"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          15
        </text>
      </svg>

      <p className="text-center text-xs text-muted-foreground mt-1">
        Высокий риск ← индекс железа → Низкий риск
      </p>
    </div>
  );
}