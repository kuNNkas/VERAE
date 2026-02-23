"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AnalysisResultRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    if (id) router.replace(`/analyses/${id}`);
  }, [id, router]);

  return (
    <div className="container max-w-2xl mx-auto py-12 px-4">
      <p className="text-muted-foreground">Перенаправление на результат…</p>
    </div>
  );
}
