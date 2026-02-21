"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listAnalyses, type AnalysisStatus } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  pending: "В очереди",
  processing: "Обрабатывается",
  completed: "Готов",
  failed: "Ошибка",
};

const STATUS_COLOR: Record<AnalysisStatus, string> = {
  pending: "text-muted-foreground",
  processing: "text-blue-600",
  completed: "text-green-600",
  failed: "text-destructive",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AnalysesListPage() {
  const { data, error, isPending } = useQuery({
    queryKey: ["analyses"],
    queryFn: listAnalyses,
  });

  return (
    <AuthGuard>
      <div className="container max-w-2xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              Кабинет
            </Link>
            <h1 className="text-2xl font-semibold">Мои анализы</h1>
          </div>
          <Button asChild>
            <Link href="/form">Новый анализ</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>История</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending && <p className="text-muted-foreground">Загрузка…</p>}
            {error && <p className="text-destructive">{error.message}</p>}
            {data?.analyses && data.analyses.length === 0 && (
              <p className="text-muted-foreground">Пока нет анализов. Создайте первый!</p>
            )}
            {data?.analyses && data.analyses.length > 0 && (
              <ul className="divide-y">
                {data.analyses.map((a, i) => {
                  const status = a.status as AnalysisStatus;
                  const href =
                    status === "completed"
                      ? `/analyses/${a.analysis_id}/result`
                      : `/analyses/${a.analysis_id}`;
                  return (
                    <li key={a.analysis_id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-0.5">
                        <Link href={href} className="font-medium hover:underline">
                          Анализ №{data.analyses.length - i}
                        </Link>
                        <span className="text-sm text-muted-foreground">{formatDate(a.created_at)}</span>
                      </div>
                      <span className={`text-sm font-medium shrink-0 ${STATUS_COLOR[status] ?? "text-muted-foreground"}`}>
                        {STATUS_LABEL[status] ?? a.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
