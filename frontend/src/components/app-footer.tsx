"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";

export function AppFooter() {
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
