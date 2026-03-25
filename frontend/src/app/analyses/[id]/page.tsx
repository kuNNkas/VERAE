"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getAnalysisStatus,
  getAnalysisResult,
  getAnalysisInput,
  getMe,
  type AnalysisStatus,
  getApiErrorMessage,
} from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FIELD_META } from "@/lib/schemas";
import { getRefRanges } from "@/lib/ref-ranges";
import { Info, Lightbulb, X } from "lucide-react";
import { trackEvent } from "@/lib/telemetry";
import {
  fetchQuantilesByGender,
  ageToGroup,
  getQuantileRow,
  getMedianForApp,
  deviationPercent,
  computePercentile,
  computePercentileFromP100,
  getTypicalRange,
  type QuantileRow,
  type AgeGroup,
} from "@/lib/quantiles";
import { getRecommendation } from "@/lib/lab-recommendations";
import type { RefRange } from "@/lib/ref-ranges";

const LAB_DESCRIPTIONS: Record<string, string> = {
  LBXHGB:   "Отражает способность крови переносить кислород. Снижение — признак анемии.",
  LBXMCVSI: "Средний объём эритроцита. Снижение указывает на микроцитарную анемию (нередко железодефицитную).",
  LBXMCHSI: "Среднее содержание гемоглобина в эритроцитах. Снижается при дефиците железа и ряде анемий.",
  LBXRDW:   "Разброс размеров эритроцитов; повышается при железодефицитной анемии и смешанных анемиях.",
  LBXRBCSI: "Количество красных кровяных клеток; снижение — признак анемии, повышение может быть при дегидратации.",
  LBXHCT:   "Доля объёма крови, приходящаяся на эритроциты. Снижается при анемии.",
  LBXWBCSI: "Количество лейкоцитов. Повышение — признак воспаления или инфекции; снижение — иммунодефицит.",
  LBXPLTSI: "Количество тромбоцитов. Отвечают за свёртываемость крови; значимые отклонения требуют внимания.",
  LBXMPSI:  "Средний объём тромбоцита. Повышение может указывать на активацию тромбоцитов.",
  LBXLYPCT: "Доля лимфоцитов среди лейкоцитов. Отклонения характерны для вирусных инфекций и иммунных нарушений.",
  LBXMOPCT: "Доля моноцитов. Повышение — признак хронического воспаления или инфекции.",
  LBXNEPCT: "Доля нейтрофилов. Повышение — частый признак бактериальных инфекций.",
  LBXEOPCT: "Доля эозинофилов. Повышение характерно для аллергии или паразитарных инфекций.",
  LBXBAPCT: "Доля базофилов. Значимое повышение встречается редко; требует обследования.",
  LBXSGL:   "Глюкоза крови натощак. Повышение — риск преддиабета или сахарного диабета.",
  LBXSCH:   "Общий холестерин. Повышение — фактор риска сердечно-сосудистых заболеваний.",
  BMXBMI:   "Индекс массы тела. Норма 18.5–25; выше 25 — избыточный вес, выше 30 — ожирение.",
  BP_SYS:   "Систолическое (верхнее) артериальное давление. Норма до 120 мм рт.ст.",
  BP_DIA:   "Диастолическое (нижнее) артериальное давление. Норма до 80 мм рт.ст.",
};

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 75000;

const TIER_LABEL: Record<string, string> = {
  HIGH: "Высокий риск",
  WARNING: "Повышенный риск",
  GRAY: "Неопределённо",
  LOW: "Низкий риск",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
};

const STATUS_META: Record<
  AnalysisStatus,
  { title: string; description: string; actionLabel: string; actionHref: string }
> = {
  pending: {
    title: "Ожидает запуска",
    description: "Анализ поставлен в очередь. Обновите статус через несколько секунд.",
    actionLabel: "Обновить статус",
    actionHref: "",
  },
  processing: {
    title: "В обработке",
    description: "Идёт расчёт показателей. Обычно это занимает меньше минуты.",
    actionLabel: "Проверить снова",
    actionHref: "",
  },
  completed: {
    title: "Готово",
    description: "Анализ завершён.",
    actionLabel: "Открыть результат",
    actionHref: "",
  },
  failed: {
    title: "Ошибка",
    description: "Во время обработки произошла ошибка. Создайте новый анализ.",
    actionLabel: "Создать новый анализ",
    actionHref: "/form",
  },
};

type ResultStatus = "normal" | "borderline" | "low" | "high";

const STATUS_COLORS: Record<ResultStatus, { bg: string; text: string; label: string }> = {
  normal:     { bg: "rgb(26, 182, 135)",  text: "#fff",    label: "Норма" },
  borderline: { bg: "rgb(255, 229, 176)", text: "#92400e", label: "Погранично" },
  low:        { bg: "rgb(248, 113, 113)", text: "#fff",    label: "Ниже нормы" },
  high:       { bg: "rgb(248, 113, 113)", text: "#fff",    label: "Выше нормы" },
};

function getResultStatus(
  value: number,
  refRange: { normalMin: number; normalMax: number; scaleMin?: number; scaleMax?: number }
): ResultStatus {
  const { normalMin, normalMax } = refRange;
  const scaleMin = refRange.scaleMin ?? normalMin - (normalMax - normalMin);
  const scaleMax = refRange.scaleMax ?? normalMax + (normalMax - normalMin);
  const range = scaleMax - scaleMin;
  const normalWidth = normalMax - normalMin;
  const borderlineWidth = Math.max(normalWidth * 0.2, range * 0.08);
  if (value >= normalMin && value <= normalMax) return "normal";
  if (value < normalMin - borderlineWidth) return "low";
  if (value > normalMax + borderlineWidth) return "high";
  return "borderline";
}


function RefRangeBar({
  value,
  refRange,
  unit,
}: {
  value: number;
  refRange: { normalMin: number; normalMax: number; scaleMin?: number; scaleMax?: number };
  unit: string;
}) {
  const scaleMin = refRange.scaleMin ?? refRange.normalMin - (refRange.normalMax - refRange.normalMin);
  const scaleMax = refRange.scaleMax ?? refRange.normalMax + (refRange.normalMax - refRange.normalMin);
  const normalWidth = refRange.normalMax - refRange.normalMin;
  const range = scaleMax - scaleMin;
  const borderlineWidth = Math.max(normalWidth * 0.2, range * 0.08);

  const status = getResultStatus(value, refRange);

  // Normalized zone widths (always the same proportions regardless of actual units)
  const RED_W = 12.5;
  const YEL_W = 12.5;
  const GRN_W = 50;
  // Zone boundaries: 0 | RED_W | RED_W+YEL_W | RED_W+YEL_W+GRN_W | 100-RED_W | 100
  const z1 = RED_W;
  const z2 = RED_W + YEL_W;
  const z3 = RED_W + YEL_W + GRN_W;
  const z4 = 100 - RED_W;

  const blLeft = refRange.normalMin - borderlineWidth;
  const blRight = refRange.normalMax + borderlineWidth;

  function toNormPct(v: number): number {
    if (v <= scaleMin) return 0;
    if (v >= scaleMax) return 100;
    if (v < blLeft)
      return (v - scaleMin) / (blLeft - scaleMin) * z1;
    if (v < refRange.normalMin)
      return z1 + (v - blLeft) / (refRange.normalMin - blLeft) * YEL_W;
    if (v <= refRange.normalMax)
      return z2 + (v - refRange.normalMin) / normalWidth * GRN_W;
    if (v <= blRight)
      return z3 + (v - refRange.normalMax) / (blRight - refRange.normalMax) * YEL_W;
    return z4 + (v - blRight) / (scaleMax - blRight) * RED_W;
  }

  const valuePct = Math.max(2, Math.min(98, toNormPct(value)));

  const pillStyle: Record<ResultStatus, string> = {
    normal: "bg-green-100 text-green-800",
    borderline: "bg-yellow-100 text-yellow-800",
    low: "bg-red-100 text-red-800",
    high: "bg-red-100 text-red-800",
  };
  const triangleColor: Record<ResultStatus, string> = {
    normal: "#16a34a",
    borderline: "#ca8a04",
    low: "#dc2626",
    high: "#dc2626",
  };
  const displayValue = value % 1 !== 0 ? value.toFixed(2) : value;

  return (
    <div className="relative pt-9 pb-5">
      {/* Value badge + downward triangle */}
      <div
        className="absolute top-0 flex flex-col items-center"
        style={{ left: `${valuePct}%`, transform: "translateX(-50%)" }}
      >
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${pillStyle[status]}`}>
          {displayValue}{unit ? ` ${unit}` : ""}
        </span>
        <div
          style={{
            marginTop: 3,
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: `6px solid ${triangleColor[status]}`,
          }}
        />
      </div>

      {/* Normalized 5-segment bar */}
      <div className="relative flex w-full gap-0.5" style={{ height: "12px" }}>
        <div className="rounded-l-full bg-red-400"    style={{ width: `${z1}%` }} />
        <div className="bg-yellow-400"               style={{ width: `${YEL_W}%` }} />
        <div className="bg-green-500"                style={{ width: `${GRN_W}%` }} />
        <div className="bg-yellow-400"               style={{ width: `${YEL_W}%` }} />
        <div className="rounded-r-full bg-red-400"   style={{ width: `${RED_W}%` }} />
      </div>

      {/* Labels at normalMin / normalMax — always at z2% and z3% */}
      <div className="relative mt-1 h-4">
        <span
          className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
          style={{ left: `${z2}%` }}
        >
          {refRange.normalMin}
        </span>
        <span
          className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
          style={{ left: `${z3}%` }}
        >
          {refRange.normalMax}
        </span>
      </div>
    </div>
  );
}

function LabInfoPopover({
  openKey,
  onClose,
  meta,
  description,
  value,
  refRange,
  refRanges,
  inputPayload,
  quantiles,
  ageGroup,
  sexLabel,
}: {
  openKey: string | null;
  onClose: () => void;
  meta: { label: string; unit: string };
  description: string;
  value: number;
  refRange: RefRange | null;
  refRanges: Record<string, RefRange>;
  inputPayload: Record<string, number | null | undefined>;
  quantiles: QuantileRow[];
  ageGroup: AgeGroup | null;
  sexLabel: "мужчин" | "женщин";
}) {
  if (!openKey) return null;

  const qRow = getQuantileRow(quantiles, ageGroup, openKey);
  const median = getMedianForApp(qRow, openKey);
  const deviationPct = median != null ? deviationPercent(value, median) : null;
  const percentile = computePercentile(value, qRow, openKey);
  const status = refRange ? getResultStatus(value, refRange) : "normal";
  const recommendation = getRecommendation(openKey, inputPayload, refRanges);

  const valueDisplay = value % 1 !== 0 ? value.toFixed(2) : value;
  const deviationStr =
    deviationPct != null && deviationPct !== 0
      ? ` ${deviationPct > 0 ? "↑" : "↓"} ${Math.abs(deviationPct)}% от медианы`
      : "";

  // Norm reserve metric
  type NormMetric =
    | { type: "in_normal"; reserve: number; label: string }
    | { type: "above"; excess: number }
    | { type: "below"; deficit: number };

  const normMetric: NormMetric | null = refRange
    ? (() => {
        const { normalMin: L, normalMax: U } = refRange;
        if (value >= L && value <= U) {
          const mid = (L + U) / 2;
          const reserve = Math.round(Math.max(0, 1 - (2 * Math.abs(value - mid)) / (U - L)) * 100);
          const nearBoundary = value > mid ? "верхней" : "нижней";
          const label =
            reserve >= 60
              ? "Уверенно в пределах нормы"
              : reserve >= 30
              ? `Ближе к ${nearBoundary} границе нормы`
              : `Вплотную к ${nearBoundary} границе нормы`;
          return { type: "in_normal", reserve, label };
        } else if (value > U) {
          return { type: "above", excess: Math.round(((value - U) / U) * 100) };
        } else {
          return { type: "below", deficit: Math.round(((L - value) / L) * 100) };
        }
      })()
    : null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-label="Закрыть"
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4"
        role="dialog"
        aria-labelledby="lab-popover-title"
        aria-modal
      >
        <Card className="border shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle id="lab-popover-title" className="text-base flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                {meta.label}
              </CardTitle>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">{meta.unit}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {/* Block 1: description */}
            <p className="text-muted-foreground leading-snug">{description}</p>

            <hr className="border-border/40" />

            {/* Block 2: Your result + bar + reserve */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground">Ваш результат</p>
                {refRange && (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ background: STATUS_COLORS[status].bg, color: STATUS_COLORS[status].text }}
                  >
                    {STATUS_COLORS[status].label}
                  </span>
                )}
              </div>
              <p className="text-lg font-semibold text-foreground">
                {valueDisplay} <span className="text-sm font-normal text-muted-foreground">{meta.unit}</span>
                {deviationStr && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">{deviationStr}</span>
                )}
              </p>
              {refRange && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Норма: {refRange.normalMin}–{refRange.normalMax} {meta.unit}
                  </p>
                  <RefRangeBar value={value} refRange={refRange} unit={meta.unit} />
                  {/* Reserve / deviation — right under bar */}
                  {normMetric && (
                    <div className="pt-1">
                      {normMetric.type === "in_normal" ? (
                        <>
                          <p className="text-xs font-medium text-foreground">{normMetric.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Запас до выхода за границу нормы: <span className="font-semibold tabular-nums" style={{ color: STATUS_COLORS.normal.bg }}>{normMetric.reserve}%</span>
                          </p>
                        </>
                      ) : normMetric.type === "above" ? (
                        <p className="text-xs font-medium" style={{ color: STATUS_COLORS.high.bg }}>
                          Выше верхней границы на {normMetric.excess}%
                        </p>
                      ) : (
                        <p className="text-xs font-medium" style={{ color: STATUS_COLORS.low.bg }}>
                          Ниже нижней границы на {normMetric.deficit}%
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Block 3: Sweet Spot — where among peers */}
            {(() => {
              const typicalRange = getTypicalRange(qRow, openKey);
              if (!typicalRange || !ageGroup || percentile == null) return null;
              const { p25, p75 } = typicalRange;

              const aboveNorm = refRange ? value > refRange.normalMax : false;
              const belowNorm = refRange ? value < refRange.normalMin : false;
              const inSweet = value >= p25 && value <= p75;
              const belowTypical = !belowNorm && !aboveNorm && value < p25;
              const aboveTypical = !belowNorm && !aboveNorm && value > p75;

              const p25d = p25 % 1 !== 0 ? p25.toFixed(2) : String(p25);
              const p75d = p75 % 1 !== 0 ? p75.toFixed(2) : String(p75);
              const typicalStr = `${p25d}–${p75d} ${meta.unit}`;

              type Zone = "below_norm" | "below_typical" | "sweet_spot" | "above_typical" | "above_norm";
              const zone: Zone = belowNorm ? "below_norm" : aboveNorm ? "above_norm" : inSweet ? "sweet_spot" : belowTypical ? "below_typical" : "above_typical";

              const SWEET_COLOR = "rgb(26, 182, 135)";

              const zoneConfig: Record<Zone, { headline: string; insight: string; markerColor: string }> = {
                below_norm: {
                  headline: `Ниже клинической нормы и ниже типичного диапазона для ${sexLabel} ${ageGroup} лет`,
                  insight: `Типичный диапазон: ${typicalStr}. Значение выпало из обеих зон — это требует внимания.`,
                  markerColor: STATUS_COLORS.low.bg,
                },
                below_typical: {
                  headline: `В пределах нормы, но ниже типичного диапазона для ${sexLabel} ${ageGroup} лет`,
                  insight: `Типичный диапазон: ${typicalStr}. Такие значения формально нормальны, однако ниже, чем у большинства сверстников. На фоне симптомов или других анализов стоит обсудить с врачом.`,
                  markerColor: STATUS_COLORS.borderline.bg,
                },
                sweet_spot: {
                  headline: `Попадает в типичный диапазон для ${sexLabel} ${ageGroup} лет`,
                  insight: `Типичный диапазон: ${typicalStr}`,
                  markerColor: SWEET_COLOR,
                },
                above_typical: {
                  headline: `В пределах нормы, но выше типичного диапазона для ${sexLabel} ${ageGroup} лет`,
                  insight: `Типичный диапазон: ${typicalStr}. Значение в норме, но выше, чем у большинства сверстников.`,
                  markerColor: STATUS_COLORS.borderline.bg,
                },
                above_norm: {
                  headline: `Выше клинической нормы и выше типичного диапазона для ${sexLabel} ${ageGroup} лет`,
                  insight: `Типичный диапазон: ${typicalStr}. Значение выпало из обеих зон — это требует внимания.`,
                  markerColor: STATUS_COLORS.high.bg,
                },
              };

              const cfg = zoneConfig[zone];
              const markerPct = Math.max(1, Math.min(99, percentile));

              return (
                <>
                  <hr className="border-border/40" />
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Где вы среди {sexLabel} {ageGroup} лет
                    </p>

                    {/* Population bar: p25–p75 highlighted in center */}
                    <div className="relative" style={{ paddingTop: "14px", paddingBottom: "2px" }}>
                      {/* Marker triangle above bar */}
                      <div
                        className="absolute"
                        style={{ left: `${markerPct}%`, top: 0, transform: "translateX(-50%)" }}
                      >
                        <div style={{ fontSize: 9, color: cfg.markerColor, lineHeight: 1 }}>▼</div>
                      </div>
                      {/* Bar track */}
                      <div className="relative h-2 w-full rounded-full overflow-hidden bg-muted">
                        {/* Typical zone highlight */}
                        <div
                          className="absolute top-0 h-full"
                          style={{
                            left: "25%",
                            width: "50%",
                            background: "rgba(26, 182, 135, 0.2)",
                            borderLeft: `1px solid ${SWEET_COLOR}`,
                            borderRight: `1px solid ${SWEET_COLOR}`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Zone labels */}
                    <div className="flex justify-between text-[9px] text-muted-foreground px-0">
                      <span>p25: {p25d}</span>
                      <span style={{ color: SWEET_COLOR }}>типичный диапазон</span>
                      <span>p75: {p75d}</span>
                    </div>

                    <p className="text-xs font-medium text-foreground">{cfg.headline}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{cfg.insight}</p>
                  </div>
                </>
              );
            })()}

            <hr className="border-border/40" />

            {/* Block 4: What to pay attention to */}
            <div className="space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
                На что обратить внимание
              </p>
              <p className="text-muted-foreground leading-snug">{recommendation}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function AnalysisDecodeBlock({
  inputPayload,
  quantiles,
  gender,
  sexLabel,
}: {
  inputPayload: Record<string, number | null | undefined>;
  quantiles: QuantileRow[];
  gender: 1 | 2;
  sexLabel: "мужчин" | "женщин";
}) {
  const [openInfoKey, setOpenInfoKey] = useState<string | null>(null);

  const ageYears = typeof inputPayload.RIDAGEYR === "number" ? inputPayload.RIDAGEYR : null;
  const ageGroup = ageYears != null ? ageToGroup(ageYears) : null;
  const refRanges = getRefRanges(gender, ageYears ?? undefined);

  const entries = Object.entries(inputPayload).filter(
    ([, v]) => v != null && typeof v === "number" && !Number.isNaN(v)
  ) as [string, number][];
  const withRef = entries.filter(([key]) => refRanges[key]);
  const withoutRef = entries.filter(([key]) => !refRanges[key]);
  const openMeta = openInfoKey
    ? FIELD_META[openInfoKey] ?? { label: openInfoKey, unit: "—" }
    : null;
  const openDescription = openInfoKey
    ? LAB_DESCRIPTIONS[openInfoKey] ??
      `${openMeta?.label ?? openInfoKey}. Единица: ${openMeta?.unit ?? "—"}.`
    : "";
  const openValue =
    openInfoKey != null && typeof inputPayload[openInfoKey] === "number"
      ? (inputPayload[openInfoKey] as number)
      : 0;
  const openRefRange = openInfoKey ? refRanges[openInfoKey] ?? null : null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Расшифровка анализов</CardTitle>
        <p className="text-sm text-muted-foreground font-normal">
          Введённые показатели и референсные зоны (норма — зелёный). Нажмите на показатель для
          справки.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {withRef.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {withRef.map(([key, value]) => {
              const meta = FIELD_META[key];
              const refRange = refRanges[key];
              if (!meta || !refRange) return null;
              const itemStatus = getResultStatus(value, refRange);
              const ss = STATUS_COLORS[itemStatus];
              return (
                <div key={key} className="relative pt-3">
                  <span
                    className="absolute top-0 left-3 z-10 px-2 py-0.5 rounded text-xs font-bold"
                    style={{ background: ss.bg, color: ss.text }}
                  >
                    {ss.label}
                  </span>
                  <div
                    role="button"
                    tabIndex={0}
                    className="rounded-lg p-3 pt-4 transition-colors hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer space-y-1"
                    style={{ border: `3px solid ${ss.bg}` }}
                    onClick={() => setOpenInfoKey(openInfoKey === key ? null : key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenInfoKey(openInfoKey === key ? null : key);
                      }
                    }}
                  >
                    <p className="text-sm font-semibold">{meta.label}</p>
                    <RefRangeBar value={value} refRange={refRange} unit={meta.unit} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {withoutRef.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Остальные показатели</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {withoutRef.map(([key, value]) => {
                const meta = FIELD_META[key];
                if (!meta) return null;
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer justify-between rounded border-2 border-transparent py-1.5 pr-2 transition-colors hover:border-border hover:bg-muted/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 border-b border-border/50"
                    onClick={() => setOpenInfoKey(openInfoKey === key ? null : key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenInfoKey(openInfoKey === key ? null : key);
                      }
                    }}
                  >
                    <dt className="text-muted-foreground truncate">{meta.label}</dt>
                    <dd className="font-medium shrink-0">
                      {typeof value === "number" && !Number.isNaN(value)
                        ? value % 1 !== 0
                          ? value.toFixed(2)
                          : value
                        : value}{" "}
                      {meta.unit}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}
      </CardContent>
      {openInfoKey && openMeta && (
        <LabInfoPopover
          openKey={openInfoKey}
          onClose={() => setOpenInfoKey(null)}
          meta={openMeta}
          description={openDescription}
          value={openValue}
          refRange={openRefRange}
          refRanges={refRanges}
          inputPayload={inputPayload}
          quantiles={quantiles}
          ageGroup={ageGroup}
          sexLabel={sexLabel}
        />
      )}
    </Card>
  );
}

export default function AnalysisPage() {
  const params = useParams();
  const id = params.id as string;
  const startRef = useRef<number>(Date.now());
  const shownRef = useRef(false);

  const profileQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });

  const statusQuery = useQuery({
    queryKey: ["analysis-status", id],
    queryFn: () => getAnalysisStatus(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      const elapsed = Date.now() - startRef.current;
      if (elapsed >= POLL_TIMEOUT_MS) return false;
      return POLL_INTERVAL_MS;
    },
    enabled: !!id,
  });

  const resultQuery = useQuery({
    queryKey: ["analysis-result", id],
    queryFn: () => getAnalysisResult(id),
    enabled: !!id && statusQuery.data?.status === "completed",
  });

  const inputQuery = useQuery({
    queryKey: ["analysis-input", id],
    queryFn: () => getAnalysisInput(id),
    enabled: !!id && statusQuery.data?.status === "completed",
  });

  const status = statusQuery.data?.status ?? null;
  const result = resultQuery.data;
  const inputData = inputQuery.data;
  const error = statusQuery.error ?? resultQuery.error;

  // Пол: из payload анализа → fallback к профилю → fallback 2 (женский)
  const sexInPayload = inputData?.input_payload?.RIAGENDR;
  const defaultGender = profileQuery.data?.default_gender;
  const gender: 1 | 2 =
    sexInPayload === 1 ? 1
    : sexInPayload === 2 ? 2
    : defaultGender === 1 ? 1
    : defaultGender === 2 ? 2
    : 2;
  const quantilesByGenderQuery = useQuery({
    queryKey: ["quantiles-by-gender", gender],
    queryFn: () => fetchQuantilesByGender(gender),
    enabled: !!inputData && status === "completed",
  });
  const quantilesResult = quantilesByGenderQuery.data;
  const sexLabel: "мужчин" | "женщин" = gender === 1 ? "мужчин" : "женщин";

  useEffect(() => {
    if (error) {
      trackEvent("api_error", { source: "analysis_page", analysis_id: id, message: (error as Error).message });
    }
  }, [error, id]);

  useEffect(() => {
    if (!shownRef.current && status === "completed" && result) {
      trackEvent("result_shown", {
        analysis_id: id,
        risk_tier: result.risk_tier,
        confidence: result.confidence,
      });
      shownRef.current = true;
    }
  }, [id, result, status]);

  if (statusQuery.isPending && !statusQuery.data) {
    return (
      <AuthGuard>
        <div className="container max-w-2xl mx-auto py-12 px-4">
          <p className="text-muted-foreground">Загрузка…</p>
        </div>
      </AuthGuard>
    );
  }

  if (status === null || status === "failed") {
    return (
      <AuthGuard>
        <div className="container max-w-md mx-auto py-12 px-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">
                {status === "failed"
                  ? "Обработка завершилась с ошибкой."
                  : "Анализ не найден."}
              </p>
              <Button asChild className="mt-4">
                <Link href="/form">Создать новый анализ</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AuthGuard>
    );
  }

  if (status !== "completed") {
    const elapsed = typeof window !== "undefined" ? Date.now() - startRef.current : 0;
    const timedOut = elapsed >= POLL_TIMEOUT_MS;
    const statusMeta = status ? STATUS_META[status] : null;

    return (
      <AuthGuard>
        <div className="container max-w-md mx-auto py-12 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Обработка анализа</CardTitle>
            </CardHeader>
            <CardContent>
              {timedOut ? (
                <>
                  <p className="text-muted-foreground">
                    Слишком долго. Вы можете вернуться позже или создать новый анализ.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button asChild variant="outline">
                      <Link href={`/analyses/${id}`}>Обновить статус</Link>
                    </Button>
                    <Button asChild>
                      <Link href="/form">Новый анализ</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    {statusMeta
                      ? `${statusMeta.title}. ${statusMeta.description}`
                      : "Определяем статус анализа…"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Этап: {statusQuery.data?.progress_stage ?? "—"}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button asChild variant="outline">
                      <Link href={`/analyses/${id}`}>
                        {status === "pending"
                          ? STATUS_META.pending.actionLabel
                          : STATUS_META.processing.actionLabel}
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link href="/form">Отменить и создать новый</Link>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </AuthGuard>
    );
  }

  if (resultQuery.isPending || !result) {
    return (
      <AuthGuard>
        <div className="container max-w-2xl mx-auto py-12 px-4">
          <p className="text-muted-foreground">Загрузка результата…</p>
        </div>
      </AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="container max-w-md mx-auto py-12 px-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">
                {getApiErrorMessage(error, "Не удалось загрузить результат анализа.")}
              </p>
              <Button asChild className="mt-4">
                <Link href="/form">Новый анализ</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AuthGuard>
    );
  }

  const ironIndex = result.iron_index ?? 0;
  const tier = result.risk_tier ?? "GRAY";
  const inputPayload = inputData?.input_payload;
  const ageYears = typeof inputPayload?.RIDAGEYR === "number" ? inputPayload.RIDAGEYR : null;
  const ageGroup = ageYears != null ? ageToGroup(ageYears) : null;
  const ironByAge = quantilesResult?.ironByAge;
  const ironPercentile =
    ageGroup && ironByAge?.[ageGroup] != null
      ? computePercentileFromP100(ironIndex, ironByAge[ageGroup])
      : null;

  return (
    <AuthGuard>
      <div className="container max-w-5xl mx-auto py-4 px-3">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Результат анализа</h1>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/form">Новый анализ</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/analyses">Мои анализы</Link>
            </Button>
          </div>
        </div>

        {inputQuery.isPending && (
          <Card className="mb-6">
            <CardHeader>
              <div className="h-5 w-40 rounded bg-muted animate-pulse mb-2" />
              <div className="h-3 w-64 rounded bg-muted animate-pulse" />
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="rounded-lg border p-3 space-y-2">
                  <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-full rounded bg-muted animate-pulse" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {inputQuery.isSuccess && inputData?.input_payload && Object.keys(inputData.input_payload).length > 0 && (
          <AnalysisDecodeBlock
            inputPayload={inputData.input_payload}
            quantiles={quantilesResult?.labRows ?? []}
            gender={gender}
            sexLabel={sexLabel}
          />
        )}
        {inputQuery.isSuccess && (!inputData?.input_payload || Object.keys(inputData.input_payload).length === 0) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Расшифровка анализов</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Введённые показатели не сохранены для этого анализа.</p>
            </CardContent>
          </Card>
        )}
        {inputQuery.isError && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Расшифровка анализов</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Не удалось загрузить введённые показатели.</p>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle>Оценка наличия железа в организме</CardTitle>
          </CardHeader>

          {/* Tier banner */}
          <div
            className={
              tier === "HIGH"
                ? "bg-red-500/10 border-y border-red-500/20 px-6 py-4"
                : tier === "WARNING"
                  ? "bg-amber-500/10 border-y border-amber-500/20 px-6 py-4"
                  : tier === "LOW"
                    ? "bg-green-500/10 border-y border-green-500/20 px-6 py-4"
                    : "bg-muted border-y px-6 py-4"
            }
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Уровень риска</p>
                <p
                  className={`text-2xl font-bold ${
                    tier === "HIGH"
                      ? "text-red-600"
                      : tier === "WARNING"
                        ? "text-amber-600"
                        : tier === "LOW"
                          ? "text-green-600"
                          : "text-muted-foreground"
                  }`}
                >
                  {TIER_LABEL[tier] ?? tier}
                </p>
              </div>
              <div className="text-right space-y-1">
                {result.risk_percent != null && (
                  <p className="text-3xl font-bold tabular-nums leading-none text-foreground">
                    {result.risk_percent}%
                  </p>
                )}
                {result.confidence && (
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-background/60 text-muted-foreground border">
                    уверенность: {CONFIDENCE_LABEL[result.confidence] ?? result.confidence}
                  </span>
                )}
              </div>
            </div>
          </div>

          <CardContent className="space-y-4 pt-5">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Индекс железа</p>
              <RefRangeBar
                value={ironIndex}
                refRange={{ normalMin: 5, normalMax: 15, scaleMin: -10, scaleMax: 15 }}
                unit=""
              />
            </div>
            {ironPercentile != null && ageGroup && (() => {
              const pct = Math.round(ironPercentile);
              const isLow = pct < 50;
              return (
                <p className="text-sm text-muted-foreground text-center">
                  Среди {sexLabel} {ageGroup} лет ваш индекс железа{" "}
                  {isLow ? `ниже, чем у ${100 - pct}%` : `выше, чем у ${pct}%`}.
                </p>
              );
            })()}
            {result.clinical_action && (
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm font-medium mb-1">Рекомендация</p>
                <p className="text-sm">{result.clinical_action}</p>
              </div>
            )}

            <hr className="border-border/40" />

            <div>
              <p className="text-sm font-semibold mb-0.5">Что повлияло на оценку</p>
              <p className="text-xs text-muted-foreground mb-3">
                Факторы, которые модель учла при расчёте риска.
              </p>
              {result.explanations && result.explanations.length > 0 ? (() => {
                type Explanation = { feature?: string; label?: string; text?: string; direction?: string; impact?: number };
                const exps = result.explanations as Explanation[];
                const maxImpact = Math.max(...exps.map((e) => Math.abs(e.impact ?? 1)), 1);
                return (
                  <ul className="space-y-3">
                    {exps.map((e, i) => {
                      const isRisk = e.direction !== "positive";
                      const barPct = Math.round((Math.abs(e.impact ?? 1) / maxImpact) * 100);
                      return (
                        <li key={i} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium truncate">{e.label ?? e.feature ?? `Фактор ${i + 1}`}</span>
                            <span className={`text-xs shrink-0 ${isRisk ? "text-amber-600" : "text-green-600"}`}>
                              {isRisk ? "↑ риск" : "↓ риск"}
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isRisk ? "bg-amber-400" : "bg-green-400"}`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          {e.text && (
                            <p className="text-xs text-muted-foreground">{e.text}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                );
              })() : (
                <p className="text-sm text-muted-foreground">
                  Детальные объяснения пока недоступны. Ориентируйтесь на уровень риска и рекомендацию выше.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center px-4">
          Это не медицинский диагноз. Результат носит исключительно информационный характер и не заменяет
          консультацию врача. Сервис не является медицинским изделием. Рекомендуем обсудить результаты со
          специалистом.
        </p>
      </div>
    </AuthGuard>
  );
}
