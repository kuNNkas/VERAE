"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { labFormSchema, REQUIRED_BASE, BMI_ALTERNATIVE, RECOMMENDED, FIELD_META, type LabFormValues } from "@/lib/schemas";
import { createAnalysis, getApiErrorMessage } from "@/lib/api";
import { setLastAnalysisId, getLastAnalysisId, clearToken } from "@/lib/auth";
import { trackEvent } from "@/lib/telemetry";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ALL_FIELDS = Array.from(new Set([...REQUIRED_BASE, ...BMI_ALTERNATIVE, ...RECOMMENDED])) as readonly string[];

function FieldInput({
  name,
  form,
  showHint = false,
}: {
  name: string;
  form: ReturnType<typeof useForm<LabFormValues>>;
  showHint?: boolean;
}) {
  const meta = FIELD_META[name];
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="flex items-baseline gap-1 flex-wrap">
        <span className="font-medium">{meta?.label ?? name}</span>
        {meta?.unit && (
          <span className="text-xs text-muted-foreground font-normal">{meta.unit}</span>
        )}
      </Label>
      <Input
        id={name}
        type="number"
        step="any"
        placeholder={meta?.hint ?? meta?.unit ?? ""}
        {...form.register(name as keyof LabFormValues, { valueAsNumber: true })}
      />
      {form.formState.errors[name as keyof LabFormValues] && (
        <p className="text-xs text-destructive">
          {form.formState.errors[name as keyof LabFormValues]?.message}
        </p>
      )}
      {showHint && meta?.hint && !form.formState.errors[name as keyof LabFormValues] && (
        <p className="text-xs text-muted-foreground">{meta.hint}</p>
      )}
    </div>
  );
}

export default function FormPage() {
  const router = useRouter();
  const [lastId, setLastId] = useState<string | null>(null);
  const [showRecommended, setShowRecommended] = useState(false);
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
    if (!hasHeight && !hasWeight) return "Укажите ИМТ или оба поля Рост и Вес.";
    if (!hasHeight) return "Добавьте Рост или заполните ИМТ.";
    if (!hasWeight) return "Добавьте Вес или заполните ИМТ.";
    return null;
  }, [hasBmi, hasHeight, hasWeight]);

  const filledRecommended = useMemo(() => {
    return RECOMMENDED.filter((name) => {
      const value = values[name as keyof LabFormValues];
      return value != null && !Number.isNaN(value);
    }).length;
  }, [values]);

  return (
    <AuthGuard>
      <div className="container max-w-3xl mx-auto py-8 px-4">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <Link href="/" className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
            VERAE
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">Кабинет</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/analyses">Мои анализы</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { clearToken(); router.push("/login"); }}
            >
              Выйти
            </Button>
          </div>
        </div>

        <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">

          {/* Section 1: Required fields */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Основные показатели</CardTitle>
              <p className="text-sm text-muted-foreground">
                Обязательны для расчёта. Значения вводите как в бланке анализов.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {REQUIRED_BASE.map((name) => (
                  <FieldInput key={name} name={name} form={form} showHint />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Section 2: BMI / Height / Weight */}
          <Card className={bmiInlineError ? "border-destructive/50" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Антропометрия</CardTitle>
              <p className="text-sm text-muted-foreground">
                Укажите <strong>ИМТ</strong> <span className="text-muted-foreground font-normal">или</span> <strong>Рост + Вес</strong> — одно из двух обязательно.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {BMI_ALTERNATIVE.map((name) => (
                  <FieldInput key={name} name={name} form={form} />
                ))}
              </div>
              {bmiInlineError && (
                <p className="mt-3 text-sm text-destructive">{bmiInlineError}</p>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Recommended fields (collapsible) */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Дополнительные показатели</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Повышают точность оценки.
                    {filledRecommended > 0 && (
                      <span className="text-primary ml-1">Заполнено: {filledRecommended}</span>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRecommended((v) => !v)}
                >
                  {showRecommended ? "Скрыть" : "Показать"}
                </Button>
              </div>
            </CardHeader>
            {showRecommended && (
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {RECOMMENDED.map((name) => (
                    <FieldInput key={name} name={name} form={form} showHint />
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Validation errors */}
          {missingRequiredFields.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="font-medium">Заполните обязательные поля:</p>
              <p>{missingRequiredFields.map((f) => FIELD_META[f]?.label ?? f).join(", ")}</p>
            </div>
          )}

          {form.formState.errors.root && (
            <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
          )}

          {/* Submit */}
          <div className="flex gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Отправка…" : "Рассчитать риск"}
            </Button>
            {lastId && (
              <Button type="button" variant="outline" asChild>
                <Link href={`/analyses/${lastId}/result`}>Последний результат</Link>
              </Button>
            )}
          </div>

        </form>
      </div>
    </AuthGuard>
  );
}
