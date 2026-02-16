"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listAnalyses } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AnalysesListPage() {
  const { data, error, isPending } = useQuery({
    queryKey: ["analyses"],
    queryFn: listAnalyses,
  });

  return (
    <AuthGuard>
      <div className="container max-w-2xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Мои анализы</h1>
          <Button asChild>
            <Link href="/form">Новый анализ</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Список</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending && <p className="text-muted-foreground">Загрузка…</p>}
            {error && <p className="text-destructive">{error.message}</p>}
            {data?.analyses && data.analyses.length === 0 && (
              <p className="text-muted-foreground">Нет анализов.</p>
            )}
            {data?.analyses && data.analyses.length > 0 && (
              <ul className="space-y-2">
                {data.analyses.map((a) => (
                  <li key={a.analysis_id}>
                    <Link
                      href={`/analyses/${a.analysis_id}/result`}
                      className="text-primary underline hover:no-underline"
                    >
                      {a.analysis_id.slice(0, 8)}… — {a.status} — {a.created_at}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
