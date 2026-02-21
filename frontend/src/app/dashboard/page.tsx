"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getUser, getToken } from "@/lib/auth";
import { listAnalyses, getAnalysisResult } from "@/lib/api";
import type { PredictResponseOk } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { User, Pencil, Upload } from "lucide-react";
import { DashboardOnboardingStepper } from "@/components/dashboard-onboarding-stepper";

const TIER_LABEL: Record<string, string> = {
  HIGH: "Высокий риск",
  WARNING: "Повышенный риск",
  GRAY: "Неопределённо",
  LOW: "Низкий риск",
};

const TIER_STYLE: Record<string, string> = {
  HIGH: "bg-red-500/10 text-red-600 border-red-500/30",
  WARNING: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  GRAY: "bg-muted text-muted-foreground border-border",
  LOW: "bg-primary/10 text-primary border-primary/30",
};

function LastResultCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="h-5 w-48 rounded bg-muted animate-pulse" />
        <div className="h-20 rounded-lg bg-muted animate-pulse" />
        <div className="flex gap-4">
          <div className="h-5 flex-1 rounded bg-muted animate-pulse" />
          <div className="h-5 flex-1 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-10 w-40 rounded-md bg-muted animate-pulse" />
      </CardContent>
    </Card>
  );
}

function LastResultCard({
  result,
  analysisId,
}: {
  result: PredictResponseOk;
  analysisId: string;
}) {
  const tier = result.risk_tier;
  const tierLabel = TIER_LABEL[tier] ?? tier;
  const tierStyle = TIER_STYLE[tier] ?? TIER_STYLE.GRAY;

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <h2 className="text-lg font-semibold">Ваш последний результат</h2>
        <div
          className={`rounded-xl border-2 px-5 py-4 text-center ${tierStyle}`}
        >
          <p className="text-2xl font-bold sm:text-3xl">{tierLabel}</p>
          {result.risk_percent != null && (
            <p className="mt-1 text-lg font-medium opacity-90">
              Риск: {result.risk_percent}%
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Индекс железа: </span>
            <span className="font-semibold">{result.iron_index.toFixed(2)}</span>
          </div>
          {result.risk_percent != null && (
            <div>
              <span className="text-muted-foreground">Риск: </span>
              <span className="font-semibold">{result.risk_percent}%</span>
            </div>
          )}
        </div>
        <Button asChild>
          <Link href={`/analyses/${analysisId}/result`}>Смотреть детали</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AnalysisInProgressCard({ analysisId }: { analysisId: string }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <h2 className="text-lg font-semibold">Последний анализ в обработке</h2>
        <p className="text-sm text-muted-foreground">
          Результат ещё готовится. Обычно это занимает менее минуты.
        </p>
        <Button asChild variant="outline">
          <Link href={`/analyses/${analysisId}`}>Проверить статус</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  const hasToken = typeof window !== "undefined" && !!getToken();

  const { data: analysesData, isSuccess, isPending, error } = useQuery({
    queryKey: ["analyses"],
    queryFn: listAnalyses,
    enabled: hasToken,
    retry: false,
  });

  const analyses = analysesData?.analyses ?? [];
  const sortedByDate = useMemo(
    () =>
      [...analyses].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [analyses]
  );
  const latestAnalysis = sortedByDate[0] ?? null;
  const latestCompleted = useMemo(
    () => sortedByDate.find((a) => a.status === "completed") ?? null,
    [sortedByDate]
  );

  const resultQuery = useQuery({
    queryKey: ["analysis-result", latestCompleted?.analysis_id],
    queryFn: () => getAnalysisResult(latestCompleted!.analysis_id),
    enabled: !!latestCompleted?.analysis_id,
    retry: false,
  });

  const count = analyses.length;
  const displayName = user?.email?.split("@")[0] ?? "Пользователь";

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold">{displayName}</h1>
                  <Link
                    href="/dashboard"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Редактировать"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {count === 0
                    ? "0 анализов загружено"
                    : `${count} ${count === 1 ? "анализ" : count < 5 ? "анализа" : "анализов"} загружено`}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  — лет • — • — кг • — см • —
                </p>
              </div>
            </div>
            <Button asChild className="shrink-0">
              <Link href="/form" className="inline-flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {count === 0 ? "Загрузить первый анализ" : "Создать анализ"}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {!hasToken && (
        <p className="text-sm text-muted-foreground">
          Войдите в аккаунт, чтобы увидеть анализы и результаты.
        </p>
      )}

      {hasToken && isPending && (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      )}

      {hasToken && error && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}

      {hasToken && isSuccess && analyses.length === 0 && (
        <DashboardOnboardingStepper />
      )}

      {hasToken && isSuccess && analyses.length > 0 && !latestCompleted && latestAnalysis && (
        <AnalysisInProgressCard analysisId={latestAnalysis.analysis_id} />
      )}

      {hasToken && isSuccess && latestCompleted && resultQuery.isPending && (
        <LastResultCardSkeleton />
      )}

      {hasToken &&
        isSuccess &&
        latestCompleted &&
        resultQuery.isSuccess &&
        resultQuery.data &&
        resultQuery.data.status === "ok" && (
          <LastResultCard
            result={resultQuery.data}
            analysisId={latestCompleted.analysis_id}
          />
        )}

      {hasToken &&
        isSuccess &&
        latestCompleted &&
        resultQuery.isError && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">
                Не удалось загрузить результат.{" "}
                <Link
                  href={`/analyses/${latestCompleted.analysis_id}/result`}
                  className="underline"
                >
                  Открыть страницу результата
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
