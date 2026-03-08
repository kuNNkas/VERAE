"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { AppFooter } from "@/components/app-footer";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <div className="flex flex-1">
          <AppSidebar />
          <main className="flex-1 flex flex-col min-w-0">{children}</main>
        </div>
        <AppFooter />
      </div>
    </AuthGuard>
  );
}
