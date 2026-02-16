"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    if (getToken()) router.replace("/form");
    else router.replace("/login");
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Загрузка…</p>
    </div>
  );
}
