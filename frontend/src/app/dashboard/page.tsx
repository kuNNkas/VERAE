"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getUser, getToken } from "@/lib/auth";
import { listAnalyses, getAnalysisResult, getLatestAnalysisInput, getMe } from "@/lib/api";
import type { PredictResponseOk } from "@/lib/api";
import { FIELD_META } from "@/lib/schemas";
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
          <Link href={`/analyses/${analysisId}`}>Смотреть детали</Link>
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

function LastAnalysisInputCard({
  input,
  analysisId,
}: {
  input: Record<string, number | null | undefined>;
  analysisId: string;
}) {
  const entries = Object.entries(input)
    .filter(([, v]) => v != null && !Number.isNaN(v))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Входные данные последнего анализа</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/analyses/${analysisId}`}>К результату</Link>
          </Button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {entries.map(([key, value]) => {
            const meta = FIELD_META[key as keyof typeof FIELD_META];
            const label = meta?.label ?? key;
            const unit = meta?.unit ?? "";
            const display =
              typeof value === "number" && Number.isInteger(value)
                ? String(value)
                : typeof value === "number"
                  ? value.toFixed(2)
                  : String(value);
            return (
              <div key={key} className="flex justify-between gap-2 border-b border-border/50 pb-1">
                <dt className="text-muted-foreground truncate">{label}</dt>
                <dd className="font-medium shrink-0">
                  {display}
                  {unit ? ` ${unit}` : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setMounted(true);
  }, []);

  const hasToken = typeof window !== "undefined" && !!getToken();

  const { data: profile } = useQuery({
    queryKey: ["user-profile"],
    queryFn: getMe,
    enabled: hasToken,
    retry: false,
  });

  const { data: analysesData, isSuccess, isPending, error } = useQuery({
    queryKey: ["analyses"],
    queryFn: listAnalyses,
    enabled: hasToken,
    retry: false,
  });

  const analyses = analysesData?.analyses ?? [];
  const profileComplete = !!(
    profile?.first_name?.trim() &&
    profile?.default_age != null
  );
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

  const latestInputQuery = useQuery({
    queryKey: ["analysis-latest-input"],
    queryFn: getLatestAnalysisInput,
    enabled: hasToken && analyses.length > 0,
    retry: false,
  });

  const count = analyses.length;
  const displayName = user?.email?.split("@")[0] ?? "Пользователь";

  // Один и тот же контент при SSR и первом рендере на клиенте, чтобы избежать ошибки гидратации
  if (!mounted) {
    return (
      <div className="p-6 max-w-3xl">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  if (!hasToken) {
    return (
      <div className="p-6 max-w-3xl">
        <p className="text-sm text-muted-foreground">
          Войдите в аккаунт, чтобы увидеть анализы и результаты.
        </p>
      </div>
    );
  }

  // Нет анализов или профиль не заполнен — весь main = только степпер (без карточки пользователя)
  if (analyses.length === 0 || !profileComplete) {
    return (
      <div className="p-6 max-w-3xl">
        <DashboardOnboardingStepper
          profile={profile ?? null}
          profileComplete={profileComplete}
          analysesLength={analyses.length}
        />
      </div>
    );
  }

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

      {isPending && (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      )}

      {error && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}

      {analyses.length > 0 && !latestCompleted && latestAnalysis && (
        <AnalysisInProgressCard analysisId={latestAnalysis.analysis_id} />
      )}

      {latestCompleted && resultQuery.isPending && (
        <LastResultCardSkeleton />
      )}

      {latestCompleted &&
        resultQuery.isSuccess &&
        resultQuery.data &&
        resultQuery.data.status === "ok" && (
          <LastResultCard
            result={resultQuery.data}
            analysisId={latestCompleted.analysis_id}
          />
        )}

      {analyses.length > 0 &&
        latestInputQuery.isSuccess &&
        latestInputQuery.data &&
        Object.keys(latestInputQuery.data.input_payload || {}).length > 0 && (
          <LastAnalysisInputCard
            input={latestInputQuery.data.input_payload}
            analysisId={latestInputQuery.data.analysis_id}
          />
        )}

      {latestCompleted && resultQuery.isError && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">
                Не удалось загрузить результат.{" "}
                <Link
                  href={`/analyses/${latestCompleted.analysis_id}`}
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
