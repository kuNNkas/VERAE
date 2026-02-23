"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getUser, clearToken } from "@/lib/auth";
import {
  LayoutGrid,
  Users,
  FileText,
  LogOut,
  Globe,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

const SIDEBAR_OPEN_KEY = "verae_sidebar_open";

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(true);
  const user = mounted ? getUser() : null;
  const displayName = user?.email?.split("@")[0] ?? "Пользователь";
  const initial = (displayName[0] ?? "П").toUpperCase();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SIDEBAR_OPEN_KEY);
    if (stored !== null) setOpen(stored === "1");
  }, []);

  const setOpenPersist = (value: boolean) => {
    setOpen(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_OPEN_KEY, value ? "1" : "0");
    }
  };

  const handleLogout = () => {
    clearToken();
    router.push("/login");
  };

  const navItems = [
    { href: "/analyses", label: "Мои анализы", icon: LayoutGrid, match: (p: string) => p?.startsWith("/analyses") },
    { href: "/dashboard", label: "Мой план", icon: FileText, match: (p: string) => p === "/dashboard" },
  ];

  return (
    <aside
      className={`shrink-0 border-r bg-muted/30 flex flex-col min-h-screen transition-[width] duration-200 ease-in-out overflow-hidden ${
        open ? "w-64" : "w-14"
      }`}
    >
      {/* Header */}
      <div className="h-14 flex items-center shrink-0 px-2 border-b">
        {open && (
          <Link
            href="/dashboard"
            className="font-semibold text-lg tracking-tight flex-1 min-w-0 truncate pl-2"
          >
            VERAE
          </Link>
        )}
        <button
          type="button"
          onClick={() => setOpenPersist(!open)}
          className={`shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${
            !open ? "mx-auto" : ""
          }`}
          title={open ? "Свернуть меню" : "Открыть меню"}
          aria-label={open ? "Свернуть меню" : "Открыть меню"}
        >
          {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="p-2 flex-1 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname ?? "");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center rounded-md py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="w-10 shrink-0 flex items-center justify-center">
                <Icon className="h-4 w-4" />
              </span>
              {open && <span className="truncate">{label}</span>}
            </Link>
          );
        })}

        {/* Моя семья — отдельно, т.к. кнопка с ChevronDown */}
        <button
          type="button"
          title="Моя семья"
          className="flex w-full items-center rounded-md py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className="w-10 shrink-0 flex items-center justify-center">
            <Users className="h-4 w-4" />
          </span>
          {open && (
            <>
              <span className="truncate flex-1 text-left">Моя семья</span>
              <ChevronDown className="h-3 w-3 shrink-0 mr-2" />
            </>
          )}
        </button>
      </nav>

      {/* User profile */}
      <div
        className={`p-2 border-t flex items-center gap-2 min-w-0 ${
          open ? "" : "justify-center"
        }`}
        title={!open ? displayName : undefined}
      >
        <div className="shrink-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
          {initial}
        </div>
        {open && (
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate text-sm leading-tight">{displayName}</p>
            <Link
              href="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground truncate block leading-tight"
            >
              Редактировать профиль
            </Link>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t space-y-0.5 shrink-0">
        <button
          type="button"
          title="Язык"
          className="flex w-full items-center rounded-md py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className="w-10 shrink-0 flex items-center justify-center">
            <Globe className="h-4 w-4" />
          </span>
          {open && (
            <>
              <span className="truncate flex-1 text-left">Русский</span>
              <ChevronDown className="h-3 w-3 shrink-0 mr-2" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          title="Выйти"
          className="flex w-full items-center rounded-md py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className="w-10 shrink-0 flex items-center justify-center">
            <LogOut className="h-4 w-4" />
          </span>
          {open && <span className="truncate">Выйти</span>}
        </button>
      </div>
    </aside>
  );
}