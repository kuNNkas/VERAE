"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!getToken()) router.replace("/login");
  }, [router]);
  return <>{children}</>;
}
