"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getAnalysisStatus,
  getAnalysisResult,
  getAnalysisInput,
  type AnalysisStatus,
  getApiErrorMessage,
} from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FIELD_META } from "@/lib/schemas";
import { REF_RANGES } from "@/lib/ref-ranges";
import { RiskGauge } from "@/components/risk-gauge";
import { ArrowDown, ArrowUp, Info, Lightbulb, X } from "lucide-react";
import { trackEvent } from "@/lib/telemetry";
import {
  fetchQuantilesByGender,
  ageToGroup,
  getQuantileRow,
  getMedianForApp,
  computePercentile,
  deviationPercent,
  computePercentileFromP100,
  type QuantileRow,
  type AgeGroup,
} from "@/lib/quantiles";
import { getRecommendation } from "@/lib/lab-recommendations";
import type { RefRange } from "@/lib/ref-ranges";

const LAB_DESCRIPTIONS: Record<string, string> = {
  LBXHGB: "Отражает способность крови переносить кислород.",
  LBXMCVSI: "Показатель размера красных кровяных клеток; используется в оценке анемий.",
  LBXMCHSI: "Насыщенность эритроцитов гемоглобином.",
  LBXRDW: "Разброс размеров эритроцитов; повышается при железодефицитной анемии.",
  LBXRBCSI: "Количество красных кровяных клеток; основной показатель кислородной функции крови.",
  LBXHCT: "Доля объёма крови, приходящаяся на эритроциты.",
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

const BORDERLINE_MARGIN = 0.05;

type ResultStatus = "normal" | "borderline" | "low" | "high";

function getResultStatus(
  value: number,
  refRange: RefRange
): ResultStatus {
  const { normalMin, normalMax } = refRange;
  const width = normalMax - normalMin;
  const margin = width * BORDERLINE_MARGIN;
  if (value >= normalMin && value <= normalMax) return "normal";
  if (value < normalMin - margin) return "low";
  if (value > normalMax + margin) return "high";
  return "borderline";
}

function ResultStatusLabel({ status }: { status: ResultStatus }) {
  const config = {
    normal: { label: "Норма", className: "text-green-600" },
    borderline: { label: "Погранично", className: "text-yellow-600" },
    low: { label: "Значимо ниже нормы", className: "text-red-600" },
    high: { label: "Значимо выше нормы", className: "text-red-600" },
  };
  const { label, className } = config[status];
  return <span className={className}>{label}</span>;
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
  const range = scaleMax - scaleMin;
  const normalWidth = refRange.normalMax - refRange.normalMin;
  const borderlineWidth = Math.max(normalWidth * 0.2, range * 0.08);

  const valuePct = Math.max(3, Math.min(97, ((value - scaleMin) / range) * 100));

  const status = getResultStatus(value, refRange);
  const pillStyle: Record<ResultStatus, string> = {
    normal: "bg-green-100 text-green-800",
    borderline: "bg-yellow-100 text-yellow-800",
    low: "bg-red-100 text-red-800",
    high: "bg-red-100 text-red-800",
  };
  const displayValue = value % 1 !== 0 ? value.toFixed(2) : value;

  const tick1 = Math.max(0, (refRange.normalMin - borderlineWidth - scaleMin) / range * 100);
  const tick2 = (refRange.normalMin - scaleMin) / range * 100;
  const tick3 = (refRange.normalMax - scaleMin) / range * 100;
  const tick4 = Math.min(100, (refRange.normalMax + borderlineWidth - scaleMin) / range * 100);

  return (
    <div className="relative pt-9 pb-5">
      {/* Value badge + downward triangle, positioned at value's X */}
      <div
        className="absolute top-0 flex flex-col items-center"
        style={{ left: `${valuePct}%`, transform: "translateX(-50%)" }}
      >
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${pillStyle[status]}`}>
          {displayValue} {unit}
        </span>
        <div
          style={{
            marginTop: 3,
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "6px solid #94a3b8",
          }}
        />
      </div>

      {/* 5-segment bar + tick marks (absolute, so ticks align with gaps) */}
      <div className="relative" style={{ height: "12px" }}>
        <div className="absolute rounded-full bg-red-400"    style={{ left: 0,                            top: 0, height: "100%", width: `calc(${tick1}% - 2px)` }} />
        <div className="absolute rounded-full bg-yellow-400" style={{ left: `calc(${tick1}% + 2px)`,     top: 0, height: "100%", width: `calc(${tick2 - tick1}% - 4px)` }} />
        <div className="absolute rounded-full bg-green-500"  style={{ left: `calc(${tick2}% + 2px)`,     top: 0, height: "100%", width: `calc(${tick3 - tick2}% - 4px)` }} />
        <div className="absolute rounded-full bg-yellow-400" style={{ left: `calc(${tick3}% + 2px)`,     top: 0, height: "100%", width: `calc(${tick4 - tick3}% - 4px)` }} />
        <div className="absolute rounded-full bg-red-400"    style={{ left: `calc(${tick4}% + 2px)`,     top: 0, height: "100%", right: 0 }} />
        {[tick1, tick2, tick3, tick4].map((pct, i) => (
          <div
            key={i}
            className="absolute bg-slate-500 rounded-full"
            style={{ left: `${pct}%`, top: "-3px", height: "18px", width: "1.5px", transform: "translateX(-50%)" }}
          />
        ))}
      </div>

      {/* Scale labels at normal range boundaries */}
      <div className="relative mt-1 h-4">
        <span
          className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
          style={{ left: `${tick2}%` }}
        >
          {refRange.normalMin}
        </span>
        <span
          className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
          style={{ left: `${tick3}%` }}
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
  const recommendation = getRecommendation(openKey, inputPayload, REF_RANGES);

  const valueDisplay =
    value % 1 !== 0 ? value.toFixed(2) : value;
  const deviationStr =
    deviationPct != null && deviationPct !== 0
      ? ` ${deviationPct > 0 ? "↑" : "↓"} ${Math.abs(deviationPct)}% от медианы возраста`
      : "";

  const percentileLabel =
    percentile != null ? `${Math.round(percentile)}-й перцентиль` : null;
  const abovePercent =
    percentile != null ? Math.round(100 - percentile) : null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-label="Закрыть"
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 px-4"
        role="dialog"
        aria-labelledby="lab-popover-title"
        aria-modal
      >
        <Card className="border shadow-lg" onClick={(e) => e.stopPropagation()}>
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
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {/* Block 1: short description */}
            <p className="text-muted-foreground leading-snug line-clamp-2">{description}</p>

            {/* Block 2: Your result */}
            <div className="space-y-1">
              <p className="font-medium text-foreground">Ваш результат</p>
              <p className="text-foreground">
                {valueDisplay} {meta.unit}
                {deviationStr && (
                  <span className="text-muted-foreground font-normal">{deviationStr}</span>
                )}
              </p>
              {refRange && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Норма: {refRange.normalMin}–{refRange.normalMax} {meta.unit}
                  </p>
                  <p className="text-xs">
                    Статус: <ResultStatusLabel status={status} />
                  </p>
                </>
              )}
            </div>

            {/* Block 3: Percentile */}
            {ageGroup && (percentileLabel != null || abovePercent != null) && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <p className="font-medium text-foreground">
                  Где вы среди {sexLabel} вашего возраста
                </p>
                {percentileLabel && (
                  <p className="text-foreground">{percentileLabel}</p>
                )}
                {abovePercent != null && (
                  <p className="text-muted-foreground text-xs">
                    {abovePercent}% {sexLabel} вашего возраста имеют значение выше вашего
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground italic">
                  Это популяционная статистика, не клинический диагноз.
                </p>
              </div>
            )}

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
  sexLabel,
}: {
  inputPayload: Record<string, number | null | undefined>;
  quantiles: QuantileRow[];
  sexLabel: "мужчин" | "женщин";
}) {
  const [openInfoKey, setOpenInfoKey] = useState<string | null>(null);

  const entries = Object.entries(inputPayload).filter(
    ([, v]) => v != null && typeof v === "number" && !Number.isNaN(v)
  ) as [string, number][];
  const withRef = entries.filter(([key]) => REF_RANGES[key]);
  const withoutRef = entries.filter(([key]) => !REF_RANGES[key]);
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
  const openRefRange = openInfoKey ? REF_RANGES[openInfoKey] ?? null : null;
  const ageYears = typeof inputPayload.RIDAGEYR === "number" ? inputPayload.RIDAGEYR : null;
  const ageGroup = ageYears != null ? ageToGroup(ageYears) : null;

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
          <div className="space-y-4">
            {withRef.map(([key, value]) => {
              const meta = FIELD_META[key];
              const refRange = REF_RANGES[key];
              if (!meta || !refRange) return null;
              const itemStatus = getResultStatus(value, refRange);
              const statusBorder: Record<ResultStatus, string> = {
                normal: "border-green-200",
                borderline: "border-yellow-200",
                low: "border-red-200",
                high: "border-red-200",
              };
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  className={`rounded-lg border p-3 transition-colors hover:bg-muted/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer space-y-1 ${statusBorder[itemStatus]}`}
                  onClick={() => setOpenInfoKey(openInfoKey === key ? null : key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenInfoKey(openInfoKey === key ? null : key);
                    }
                  }}
                >
                  <p className="text-sm font-medium text-muted-foreground">{meta.label}</p>
                  <RefRangeBar value={value} refRange={refRange} unit={meta.unit} />
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

  const sex = inputData?.input_payload?.RIAGENDR;
  const gender: 1 | 2 = sex === 1 ? 1 : 2;
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
                    {status === "failed" ? (
                      <Button asChild>
                        <Link href={STATUS_META.failed.actionHref}>{STATUS_META.failed.actionLabel}</Link>
                      </Button>
                    ) : (
                      <>
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
                      </>
                    )}
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
      <div className="container max-w-2xl mx-auto py-8 px-4">
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
              <CardTitle className="text-lg">Расшифровка анализов</CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Введённые показатели и референсные зоны (норма — зелёный).
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Загрузка введённых данных…</p>
            </CardContent>
          </Card>
        )}
        {inputQuery.isSuccess && inputData?.input_payload && Object.keys(inputData.input_payload).length > 0 && (
          <AnalysisDecodeBlock
            inputPayload={inputData.input_payload}
            quantiles={quantilesResult?.labRows ?? []}
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

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Предсказание железа в организме</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RiskGauge
              ironIndex={ironIndex}
              riskPercent={result.risk_percent ?? undefined}
            />
            {ironPercentile != null && ageGroup && (
              <p className="text-sm text-muted-foreground">
                Среди {sexLabel} {ageGroup} лет ваш индекс железа выше, чем у{" "}
                {Math.round(ironPercentile)}%.
              </p>
            )}
            <p>
              <strong>Уровень риска:</strong>{" "}
              <span
                className={
                  tier === "HIGH"
                    ? "text-red-600 font-semibold"
                    : tier === "WARNING"
                      ? "text-yellow-600 font-semibold"
                      : tier === "LOW"
                        ? "text-primary font-semibold"
                        : "text-muted-foreground font-semibold"
                }
              >
                {TIER_LABEL[tier] ?? tier}
              </span>
              {result.risk_percent != null && (
                <span className="text-muted-foreground text-sm ml-2">({result.risk_percent}%)</span>
              )}
            </p>
            {result.clinical_action && (
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm font-medium mb-1">Рекомендация</p>
                <p className="text-sm">{result.clinical_action}</p>
                <Button variant="outline" size="sm" className="mt-3" disabled>
                  Сдать ферритин у партнёра — скоро
                </Button>
              </div>
            )}
            {result.confidence && (
              <p className="text-sm text-muted-foreground">
                Уверенность модели: {CONFIDENCE_LABEL[result.confidence] ?? result.confidence}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Что повлияло на оценку</CardTitle>
          </CardHeader>
          <CardContent>
            {result.explanations && result.explanations.length > 0 ? (
              <ul className="space-y-2">
                {result.explanations.map(
                  (
                    e: { feature?: string; label?: string; text?: string; direction?: string },
                    i: number
                  ) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {e.direction === "negative" ? (
                        <ArrowDown className="h-4 w-4 shrink-0 text-amber-600" />
                      ) : (
                        <ArrowUp className="h-4 w-4 shrink-0 text-green-600" />
                      )}
                      <span>
                        <strong>{e.label ?? e.feature ?? `Фактор ${i + 1}`}</strong>:{" "}
                        {e.text ?? "Без дополнительного комментария."}
                      </span>
                    </li>
                  )
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Детальные объяснения пока недоступны. Ориентируйтесь на уровень риска и рекомендацию выше.
              </p>
            )}
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
