"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { getUser, clearToken } from "@/lib/auth";
import {
  LayoutGrid,
  Users,
  FileText,
  LogOut,
  Globe,
  ChevronDown,
  HelpCircle,
} from "lucide-react";

function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const user = mounted ? getUser() : null;
  const displayName = user?.email?.split("@")[0] ?? "Пользователь";
  const initial = (displayName[0] ?? "П").toUpperCase();

  useEffect(() => setMounted(true), []);

  const handleLogout = () => {
    clearToken();
    router.push("/login");
  };

  return (
    <aside className="w-64 shrink-0 border-r bg-muted/30 flex flex-col min-h-screen">
      <div className="p-4 border-b">
        <Link href="/dashboard" className="font-semibold text-lg tracking-tight">
          VERAE
        </Link>
      </div>
      <div className="p-4 space-y-1 bg-muted/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{displayName}</p>
            <Link
              href="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Редактировать профиль
            </Link>
          </div>
        </div>
      </div>
      <nav className="p-2 flex-1">
        <Link
          href="/analyses"
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            pathname?.startsWith("/analyses")
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          Мои анализы
        </Link>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Users className="h-4 w-4" />
          Моя семья
          <ChevronDown className="h-3 w-3 ml-auto" />
        </button>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <FileText className="h-4 w-4" />
          Мой план
        </Link>
      </nav>
      <div className="p-2 border-t space-y-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Globe className="h-4 w-4" />
          Русский
          <ChevronDown className="h-3 w-3 ml-auto" />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>
      </div>
    </aside>
  );
}

function DashboardFooter() {
  return (
    <footer className="border-t bg-muted/30 px-6 py-4 mt-auto">
      <div className="max-w-4xl flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 text-xs text-muted-foreground">
        <div className="max-w-xl">
          <p>
            Disclaimer: Сервис носит информационный характер и не является
            медицинским изделием. Результаты не заменяют консультацию врача.
          </p>
          <p className="mt-2">© {new Date().getFullYear()} VERAE</p>
        </div>
        <div className="flex flex-wrap gap-4 shrink-0">
          <Link href="#" className="inline-flex items-center gap-1 hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
            Помощь
          </Link>
          <Link href="#" className="hover:text-foreground">
            Условия использования
          </Link>
          <Link href="#" className="hover:text-foreground">
            Политика конфиденциальности
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0">{children}</main>
        </div>
        <DashboardFooter />
      </div>
    </AuthGuard>
  );
}
