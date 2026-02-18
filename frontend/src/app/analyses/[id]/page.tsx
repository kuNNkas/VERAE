"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalysisStatus, type AnalysisStatus, getApiErrorMessage } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 75000;

const STATUS_META: Record<AnalysisStatus, { title: string; description: string; actionLabel: string; actionHref: string }> = {
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
    description: "Анализ завершён. Можно открыть результат.",
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

export default function AnalysisStatusPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const startRef = useRef<number>(Date.now());

  const { data, error, isPending } = useQuery({
    queryKey: ["analysis-status", id],
    queryFn: () => getAnalysisStatus(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed") return false;
      if (status === "failed") return false;
      const elapsed = Date.now() - startRef.current;
      if (elapsed >= POLL_TIMEOUT_MS) return false;
      return POLL_INTERVAL_MS;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (data?.status === "completed") {
      router.replace(`/analyses/${id}/result`);
    }
  }, [data?.status, id, router]);

  if (data === null && !isPending) {
    return (
      <AuthGuard>
        <div className="container max-w-md mx-auto py-12 px-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">Анализ не найден.</p>
              <Button asChild className="mt-4">
                <Link href="/form">Новый анализ</Link>
              </Button>
            </CardContent>
          </Card>
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
              <p className="text-destructive">{getApiErrorMessage(error, "Не удалось получить статус анализа.")}</p>
              <Button asChild className="mt-4">
                <Link href="/form">Создать новый анализ</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AuthGuard>
    );
  }

  const elapsed = typeof window !== "undefined" ? Date.now() - startRef.current : 0;
  const timedOut = elapsed >= POLL_TIMEOUT_MS;
  const status = data?.status;
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
                <p className="text-muted-foreground">Слишком долго. Вы можете вернуться позже или создать новый анализ.</p>
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
                  {isPending && !data
                    ? "Загрузка…"
                    : statusMeta
                      ? `${statusMeta.title}. ${statusMeta.description}`
                      : "Определяем статус анализа…"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Этап: {data?.progress_stage ?? "—"}</p>
                <div className="mt-4 flex gap-2">
                  {status === "completed" ? (
                    <Button asChild>
                      <Link href={`/analyses/${id}/result`}>{STATUS_META.completed.actionLabel}</Link>
                    </Button>
                  ) : status === "failed" ? (
                    <Button asChild>
                      <Link href={STATUS_META.failed.actionHref}>{STATUS_META.failed.actionLabel}</Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild variant="outline">
                        <Link href={`/analyses/${id}`}>{status === "pending" ? STATUS_META.pending.actionLabel : STATUS_META.processing.actionLabel}</Link>
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
