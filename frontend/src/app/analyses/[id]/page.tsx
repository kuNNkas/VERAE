"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalysisStatus } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 75000;

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
              <p className="text-destructive">{error.message}</p>
              <Button asChild className="mt-4">
                <Link href="/form">Создать новый анализ</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AuthGuard>
    );
  }

  if (data?.status === "failed") {
    return (
      <AuthGuard>
        <div className="container max-w-md mx-auto py-12 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Ошибка обработки</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Обработка завершилась с ошибкой.</p>
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

  return (
    <AuthGuard>
      <div className="container max-w-md mx-auto py-12 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Обработка анализа</CardTitle>
          </CardHeader>
          <CardContent>
            {timedOut ? (
              <p className="text-muted-foreground">Слишком долго. Попробуйте позже или создайте новый анализ.</p>
            ) : (
              <p className="text-muted-foreground">
                {isPending && !data ? "Загрузка…" : `Статус: ${data?.status ?? "—"} (${data?.progress_stage ?? "—"})`}
              </p>
            )}
            <Button asChild variant="outline" className="mt-4">
              <Link href="/form">Отмена</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
