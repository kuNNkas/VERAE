"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-4 flex justify-between items-center">
        <span className="font-semibold text-lg tracking-tight">VERAE</span>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Войти</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Начать бесплатно</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="max-w-2xl space-y-6">
          <div className="inline-block rounded-full bg-muted px-4 py-1 text-sm text-muted-foreground">
            Бесплатно · Без регистрации карты
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Узнайте риск дефицита железа
            <br />
            по анализу крови
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Введите результаты общего анализа крови — и за секунды получите
            персональную оценку риска, объяснение ключевых показателей
            и рекомендацию по следующему шагу.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" asChild>
              <Link href="/register">Проверить мои анализы</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Войти в аккаунт</Link>
            </Button>
          </div>
        </div>
      </main>

      <section className="border-t py-12 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          <div className="space-y-2">
            <p className="text-2xl font-bold">29</p>
            <p className="text-sm text-muted-foreground">показателей ОАК анализируются моделью</p>
          </div>
          <div className="space-y-2">
            <p className="text-2xl font-bold">&lt; 10 сек</p>
            <p className="text-sm text-muted-foreground">время расчёта после ввода данных</p>
          </div>
          <div className="space-y-2">
            <p className="text-2xl font-bold">4 уровня</p>
            <p className="text-sm text-muted-foreground">риска: от низкого до высокого</p>
          </div>
        </div>
      </section>

      <footer className="border-t py-6 px-4 text-center text-xs text-muted-foreground">
        Это не медицинский диагноз. Сервис носит информационный характер и не является медицинским изделием.
      </footer>
    </div>
  );
}
