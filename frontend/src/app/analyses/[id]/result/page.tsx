"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getAnalysisStatus, getAnalysisResult, getApiErrorMessage } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ArrowDown, ArrowUp } from "lucide-react";
import { trackEvent } from "@/lib/telemetry";

const IRON_INDEX_MIN = -10;
const IRON_INDEX_MAX = 15;

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

export default function AnalysisResultPage() {
  const params = useParams();
  const id = params.id as string;
  const shownRef = useRef(false);

  const statusQuery = useQuery({
    queryKey: ["analysis-status", id],
    queryFn: () => getAnalysisStatus(id),
    enabled: !!id,
  });

  const resultQuery = useQuery({
    queryKey: ["analysis-result", id],
    queryFn: () => getAnalysisResult(id),
    enabled: !!id && statusQuery.data?.status === "completed",
  });

  const status = statusQuery.data?.status;
  const result = resultQuery.data;
  const error = statusQuery.error ?? resultQuery.error;

  useEffect(() => {
    if (error) {
      trackEvent("api_error", { source: "analysis_result", analysis_id: id, message: error.message });
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
    return (
      <AuthGuard>
        <div className="container max-w-md mx-auto py-12 px-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">Результат ещё не готов. Подождите или создайте новый анализ.</p>
              <Button asChild className="mt-4">
                <Link href={`/analyses/${id}`}>Проверить статус</Link>
              </Button>
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
              <p className="text-destructive">{getApiErrorMessage(error, "Не удалось загрузить результат анализа.")}</p>
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
  const barFill = tier === "HIGH" ? "#ef4444" : tier === "WARNING" ? "#eab308" : tier === "GRAY" ? "#94a3b8" : "#22c55e";
  const barData = [{ value: ironIndex, fill: barFill }];

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

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Оценка риска</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              <strong>Уровень риска:</strong>{" "}
              <span className={
                tier === "HIGH" ? "text-red-600 font-semibold" :
                tier === "WARNING" ? "text-yellow-600 font-semibold" :
                tier === "LOW" ? "text-primary font-semibold" :
                "text-muted-foreground font-semibold"
              }>
                {TIER_LABEL[tier] ?? tier}
              </span>
              {result.risk_percent != null && (
                <span className="text-muted-foreground text-sm ml-2">({result.risk_percent}%)</span>
              )}
            </p>
            <p><strong>Индекс железа:</strong> {ironIndex.toFixed(2)}</p>
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

            <div className="h-8 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" domain={[IRON_INDEX_MIN, IRON_INDEX_MAX]} hide />
                  <YAxis type="category" dataKey="name" width={0} hide />
                  <ReferenceLine x={0} stroke="#64748b" strokeWidth={2} />
                  <Bar dataKey="value" barSize={24} radius={4}>
                    <Cell fill={barData[0].fill} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground">Шкала: {IRON_INDEX_MIN} … {IRON_INDEX_MAX} (индекс железа)</p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Что повлияло на оценку</CardTitle>
          </CardHeader>
          <CardContent>
            {result.explanations && result.explanations.length > 0 ? (
              <ul className="space-y-2">
                {result.explanations.map((e: { feature?: string; label?: string; text?: string; direction?: string }, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {e.direction === "negative" ? (
                      <ArrowDown className="h-4 w-4 shrink-0 text-amber-600" />
                    ) : (
                      <ArrowUp className="h-4 w-4 shrink-0 text-green-600" />
                    )}
                    <span><strong>{e.label ?? e.feature ?? `Фактор ${i + 1}`}</strong>: {e.text ?? "Без дополнительного комментария."}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Детальные объяснения пока недоступны. Итог уже рассчитан: ориентируйтесь на уровень риска и клиническую рекомендацию выше.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center px-4">
          Это не медицинский диагноз. Результат носит исключительно информационный характер и не заменяет консультацию врача.
          Сервис не является медицинским изделием. Рекомендуем обсудить результаты со специалистом.
        </p>
      </div>
    </AuthGuard>
  );
}
