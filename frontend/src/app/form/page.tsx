"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { labFormSchema, REQUIRED_BASE, BMI_ALTERNATIVE, RECOMMENDED, type LabFormValues } from "@/lib/schemas";
import { createAnalysis, getApiErrorMessage } from "@/lib/api";
import { setLastAnalysisId, getLastAnalysisId, clearToken } from "@/lib/auth";
import { trackEvent } from "@/lib/telemetry";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ALL_FIELDS = Array.from(new Set([...REQUIRED_BASE, ...BMI_ALTERNATIVE, ...RECOMMENDED])) as readonly string[];
const REQUIRED_SET = new Set([...REQUIRED_BASE, ...BMI_ALTERNATIVE]);


export default function FormPage() {
  const router = useRouter();
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => setLastId(getLastAnalysisId()), []);

  const form = useForm<LabFormValues>({
    resolver: zodResolver(labFormSchema),
    defaultValues: Object.fromEntries(ALL_FIELDS.map((k) => [k, undefined])) as LabFormValues,
  });

  const mutation = useMutation({
    mutationFn: async (values: LabFormValues) => {
      const lab: Record<string, number> = {};
      for (const k of ALL_FIELDS) {
        const v = values[k as keyof LabFormValues];
        const num = typeof v === "number" ? v : Number(v);
        if (v != null && !Number.isNaN(num)) lab[k] = num;
      }
      const labJson = JSON.stringify(lab);
      const upload = {
        filename: "manual.json",
        content_type: "application/json",
        size_bytes: new TextEncoder().encode(labJson).length,
      };
      return createAnalysis(upload, lab);
    },
    onSuccess: (data) => {
      setLastAnalysisId(data.analysis_id);
      trackEvent("form_submit_success", { analysis_id: data.analysis_id });
      router.push(`/analyses/${data.analysis_id}`);
    },
    onError: (err: Error) => {
      trackEvent("api_error", { source: "form_submit", message: err.message });
      form.setError("root", { message: err.message });
    },
  });

  const values = form.watch();
  const hasBmi = values.BMXBMI != null && !Number.isNaN(values.BMXBMI);
  const hasHeight = values.BMXHT != null && !Number.isNaN(values.BMXHT);
  const hasWeight = values.BMXWT != null && !Number.isNaN(values.BMXWT);

  const missingRequiredFields = useMemo(() => {
    return REQUIRED_BASE.filter((name) => {
      const value = values[name];
      return value == null || Number.isNaN(value);
    });
  }, [values]);

  const bmiInlineError = useMemo(() => {
    if (hasBmi || (hasHeight && hasWeight)) return null;
    if (!hasHeight && !hasWeight) return "Укажите BMXBMI или оба поля BMXHT и BMXWT.";
    if (!hasHeight) return "Добавьте BMXHT или заполните BMXBMI.";
    if (!hasWeight) return "Добавьте BMXWT или заполните BMXBMI.";
    return null;
  }, [hasBmi, hasHeight, hasWeight]);

  return (
    <AuthGuard>
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">VERAE — ввод анализов</h1>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/analyses">Мои анализы</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                clearToken();
                router.push("/login");
              }}
            >
              Выйти
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Лабораторные показатели</CardTitle>
            <p className="text-sm text-muted-foreground">
              Заполните обязательные поля (8): базовые + BMXBMI или BMXHT и BMXWT. Остальные повышают точность.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              className="grid grid-cols-2 gap-4"
            >
              {ALL_FIELDS.map((name) => (
                <div key={name} className="space-y-2">
                  <Label htmlFor={name}>
                    {name}
                    {REQUIRED_SET.has(name as typeof REQUIRED_BASE[number] | typeof BMI_ALTERNATIVE[number])
                      ? " *"
                      : " (рекоменд.)"}
                  </Label>
                  <Input
                    id={name}
                    type="number"
                    step="any"
                    {...form.register(name as keyof LabFormValues, { valueAsNumber: true })}
                  />
                  {form.formState.errors[name as keyof LabFormValues] && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors[name as keyof LabFormValues]?.message}
                    </p>
                  )}
                </div>
              ))}
              {missingRequiredFields.length > 0 && (
                <div className="col-span-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <p className="font-medium">Заполните обязательные поля:</p>
                  <p>{missingRequiredFields.join(", ")}</p>
                </div>
              )}
              {bmiInlineError && (
                <div className="col-span-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <p className="font-medium">Требование по BMI:</p>
                  <p>{bmiInlineError}</p>
                </div>
              )}

              {form.formState.errors.root && (
                <p className="col-span-2 text-sm text-destructive">
                  {form.formState.errors.root.message}
                </p>
              )}
              <div className="col-span-2 flex gap-2">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Отправка…" : "Анализировать"}
                </Button>
                {lastId && (
                  <Button type="button" variant="outline" asChild>
                    <Link href={`/analyses/${lastId}/result`}>Открыть последний результат</Link>
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
