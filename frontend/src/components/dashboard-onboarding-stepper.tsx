"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, BarChart3, Heart } from "lucide-react";

const STEPS = [
  {
    step: 1,
    icon: ClipboardList,
    title: "Введите показатели ОАК",
    description: "Добавьте результаты общего анализа крови из бланка лаборатории.",
  },
  {
    step: 2,
    icon: BarChart3,
    title: "Получите оценку риска",
    description: "Модель рассчитает риск дефицита железа за несколько секунд.",
  },
  {
    step: 3,
    icon: Heart,
    title: "Следуйте рекомендациям",
    description: "Персональная рекомендация и объяснение ключевых показателей.",
  },
];

export function DashboardOnboardingStepper() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Ваш первый анализ</CardTitle>
        <p className="text-sm text-muted-foreground font-normal">
          Три простых шага до оценки риска дефицита железа
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {STEPS.map(({ step, icon: Icon, title, description }) => (
            <div key={step} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/form">Заполнить показатели</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
