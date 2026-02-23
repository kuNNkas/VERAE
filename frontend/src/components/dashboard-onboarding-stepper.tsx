"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  labFormSchemaOnboarding,
  profileFormSchema,
  REQUIRED_LAB_ONLY,
  RECOMMENDED,
  FIELD_META,
  type LabFormValues,
  type ProfileFormValues,
} from "@/lib/schemas";
import {
  patchMe,
  createAnalysis,
  getAnalysisStatus,
  getApiErrorMessage,
} from "@/lib/api";
import type { UserProfileResponse } from "@/lib/api";
import { setLastAnalysisId } from "@/lib/auth";

export interface DashboardOnboardingStepperProps {
  profile: UserProfileResponse | null;
  profileComplete: boolean;
  analysesLength: number;
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const ALL_LAB_FIELDS = Array.from(
  new Set([...REQUIRED_LAB_ONLY, ...RECOMMENDED])
) as readonly string[];

function LabFieldInput({
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
          <span className="text-xs text-muted-foreground font-normal">
            {meta.unit}
          </span>
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
          {
            form.formState.errors[name as keyof LabFormValues]
              ?.message as string
          }
        </p>
      )}
      {showHint &&
        meta?.hint &&
        !form.formState.errors[name as keyof LabFormValues] && (
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
        )}
    </div>
  );
}

export function DashboardOnboardingStepper({
  profile,
  profileComplete,
  analysesLength,
}: DashboardOnboardingStepperProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showRecommended, setShowRecommended] = useState(false);
  const [createdAnalysisId, setCreatedAnalysisId] = useState<string | null>(
    null
  );

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      first_name: profile?.first_name ?? "",
      last_name: profile?.last_name ?? "",
      default_age: profile?.default_age ?? undefined,
      default_gender:
        profile?.default_gender === 1 || profile?.default_gender === 2
          ? profile.default_gender
          : undefined,
      default_height: profile?.default_height ?? undefined,
      default_weight: profile?.default_weight ?? undefined,
    },
  });

  useEffect(() => {
    if (profile) {
      profileForm.reset({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        default_age: profile.default_age ?? undefined,
        default_gender:
          profile.default_gender === 1 || profile.default_gender === 2
            ? profile.default_gender
            : undefined,
        default_height: profile.default_height ?? undefined,
        default_weight: profile.default_weight ?? undefined,
      });
    }
  }, [profile?.id, profile?.first_name, profile?.last_name, profile?.default_age, profile?.default_gender, profile?.default_height, profile?.default_weight]);

  const labForm = useForm<LabFormValues>({
    resolver: zodResolver(labFormSchemaOnboarding),
    defaultValues: Object.fromEntries(
      ALL_LAB_FIELDS.map((k) => [k, undefined])
    ) as LabFormValues,
  });

  const profileMutation = useMutation({
    mutationFn: (data: ProfileFormValues) =>
      patchMe({
        first_name: data.first_name || null,
        last_name: data.last_name || undefined,
        default_age: data.default_age,
        default_gender: data.default_gender,
        default_height: data.default_height,
        default_weight: data.default_weight,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
    onError: (err: Error) => {
      profileForm.setError("root", { message: err.message });
    },
  });

  const analysisMutation = useMutation({
    mutationFn: async (values: LabFormValues) => {
      const lab: Record<string, number> = {};
      for (const k of ALL_LAB_FIELDS) {
        const v = values[k as keyof LabFormValues];
        const num = typeof v === "number" ? v : Number(v);
        if (v != null && !Number.isNaN(num)) lab[k] = num;
      }
      // Возраст и антропометрия из профиля (шаг 1)
      if (profile?.default_age != null) lab.RIDAGEYR = profile.default_age;
      if (profile?.default_height != null) lab.BMXHT = profile.default_height;
      if (profile?.default_weight != null) lab.BMXWT = profile.default_weight;
      if (lab.BMXHT != null && lab.BMXWT != null) {
        lab.BMXBMI = lab.BMXWT / (lab.BMXHT / 100) ** 2;
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
      setCreatedAnalysisId(data.analysis_id);
    },
    onError: (err: Error) => {
      labForm.setError("root", {
        message: getApiErrorMessage(err, "Не удалось отправить анализ."),
      });
    },
  });

  const statusQuery = useQuery({
    queryKey: ["analysis-status", createdAnalysisId],
    queryFn: () => getAnalysisStatus(createdAnalysisId!),
    enabled: !!createdAnalysisId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 2000;
    },
  });

  const labValues = labForm.watch();
  const filledRecommended = useMemo(
    () =>
      RECOMMENDED.filter((name) => {
        const v = labValues[name as keyof LabFormValues];
        return v != null && !Number.isNaN(v);
      }).length,
    [labValues]
  );
  const analysisCompleted = statusQuery.data?.status === "completed";

  if (!profileComplete) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Шаг 1: Данные о себе</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Заполните профиль для персональной оценки.
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={profileForm.handleSubmit((data) =>
              profileMutation.mutate(data)
            )}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Имя</Label>
                <Input
                  id="first_name"
                  {...profileForm.register("first_name")}
                  placeholder="Иван"
                />
                {profileForm.formState.errors.first_name && (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.first_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Фамилия</Label>
                <Input
                  id="last_name"
                  {...profileForm.register("last_name")}
                  placeholder="Иванов"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="default_age">Возраст (лет)</Label>
                <Input
                  id="default_age"
                  type="number"
                  min={0}
                  max={120}
                  {...profileForm.register("default_age", {
                    valueAsNumber: true,
                  })}
                />
                {profileForm.formState.errors.default_age && (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.default_age.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="default_gender">Пол</Label>
                <select
                  id="default_gender"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  {...profileForm.register("default_gender", {
                    setValueAs: (v) => (v === "" ? undefined : Number(v)),
                  })}
                >
                  <option value="">—</option>
                  <option value={1}>Мужской</option>
                  <option value={2}>Женский</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="default_height">Рост (см)</Label>
                <Input
                  id="default_height"
                  type="number"
                  step="any"
                  {...profileForm.register("default_height", {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default_weight">Вес (кг)</Label>
                <Input
                  id="default_weight"
                  type="number"
                  step="any"
                  {...profileForm.register("default_weight", {
                    valueAsNumber: true,
                  })}
                />
              </div>
            </div>
            {profileForm.formState.errors.root && (
              <p className="text-sm text-destructive">
                {profileForm.formState.errors.root.message}
              </p>
            )}
            <Button type="submit" disabled={profileMutation.isPending}>
              {profileMutation.isPending ? "Сохранение…" : "Далее"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (analysesLength > 0) {
    return null;
  }

  if (createdAnalysisId && analysisCompleted) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Анализ готов. Откройте расшифровку результата.
          </p>
          <Button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["analyses"] });
              router.push(`/analyses/${createdAnalysisId}`);
            }}
          >
            Получить расшифровку
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (createdAnalysisId && !analysisCompleted) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Готовим анализ…</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Обычно это занимает менее минуты.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Шаг 2: Загрузка анализа</CardTitle>
        <p className="text-sm text-muted-foreground font-normal">
          Введите показатели ОАК из бланка лаборатории.
        </p>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={labForm.handleSubmit((data) => analysisMutation.mutate(data))}
          className="space-y-6"
        >
          <div>
            <h3 className="text-sm font-medium mb-2">Обязательные показатели</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Возраст и антропометрия (рост, вес) подставляются из вашего профиля.
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {REQUIRED_LAB_ONLY.map((name) => (
                <LabFieldInput key={name} name={name} form={labForm} showHint />
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Дополнительные показатели</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowRecommended((v) => !v)}
              >
                {showRecommended ? "Скрыть" : "Показать"}
              </Button>
            </div>
            {filledRecommended > 0 && (
              <p className="text-xs text-muted-foreground mb-2">
                Заполнено: {filledRecommended}
              </p>
            )}
            {showRecommended && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mt-2">
                {RECOMMENDED.map((name) => (
                  <LabFieldInput
                    key={name}
                    name={name}
                    form={labForm}
                    showHint
                  />
                ))}
              </div>
            )}
          </div>
          {labForm.formState.errors.root && (
            <p className="text-sm text-destructive">
              {labForm.formState.errors.root.message}
            </p>
          )}
          <Button type="submit" disabled={analysisMutation.isPending}>
            {analysisMutation.isPending ? "Отправка…" : "Отправить"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
