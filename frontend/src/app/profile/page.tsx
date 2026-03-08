"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { profileFormSchema, type ProfileFormValues } from "@/lib/schemas";
import { getMe, patchMe, getApiErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasToken = typeof window !== "undefined" && !!getToken();

  const { data: profile, isPending } = useQuery({
    queryKey: ["user-profile"],
    queryFn: getMe,
    enabled: hasToken,
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      default_age: undefined,
      default_gender: undefined,
      default_height: undefined,
      default_weight: undefined,
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
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
  }, [profile?.id]);

  const mutation = useMutation({
    mutationFn: (data: ProfileFormValues) =>
      patchMe({
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        default_age: data.default_age,
        default_gender: data.default_gender,
        default_height: data.default_height,
        default_weight: data.default_weight,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
    onError: (err: Error) => {
      form.setError("root", {
        message: getApiErrorMessage(err, "Не удалось сохранить профиль."),
      });
    },
  });

  return (
    <div className="container max-w-lg mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Профиль</h1>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">Назад</Link>
          </Button>
        </div>

        {isPending && (
          <p className="text-sm text-muted-foreground mb-4">Загрузка…</p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Личные данные</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Используются для персональной оценки и автозаполнения в формах.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              className="space-y-5"
            >
              {/* Имя / Фамилия */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Имя *</Label>
                  <Input
                    id="first_name"
                    {...form.register("first_name")}
                    placeholder="Иван"
                  />
                  {form.formState.errors.first_name && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.first_name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Фамилия</Label>
                  <Input
                    id="last_name"
                    {...form.register("last_name")}
                    placeholder="Иванов"
                  />
                </div>
              </div>

              {/* Возраст / Пол */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="default_age">Возраст (лет) *</Label>
                  <Input
                    id="default_age"
                    type="number"
                    min={0}
                    max={120}
                    {...form.register("default_age", { valueAsNumber: true })}
                  />
                  {form.formState.errors.default_age && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.default_age.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_gender">Пол</Label>
                  <select
                    id="default_gender"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    {...form.register("default_gender", {
                      setValueAs: (v) => (v === "" ? undefined : Number(v)),
                    })}
                  >
                    <option value="">—</option>
                    <option value={1}>Мужской</option>
                    <option value={2}>Женский</option>
                  </select>
                </div>
              </div>

              {/* Рост / Вес */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="default_height">Рост (см)</Label>
                  <Input
                    id="default_height"
                    type="number"
                    step="any"
                    placeholder="170"
                    {...form.register("default_height", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_weight">Вес (кг)</Label>
                  <Input
                    id="default_weight"
                    type="number"
                    step="any"
                    placeholder="70"
                    {...form.register("default_weight", { valueAsNumber: true })}
                  />
                </div>
              </div>

              {form.formState.errors.root && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.root.message}
                </p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Сохранение…" : "Сохранить"}
                </Button>
                {mutation.isSuccess && (
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <Check className="h-4 w-4" />
                    Сохранено
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
  );
}
