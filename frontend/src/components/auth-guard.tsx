"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";

const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isDev) return;
    if (!getToken()) router.replace("/login");
  }, [router]);
  return <>{children}</>;
}
