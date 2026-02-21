"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { registerSchema } from "@/lib/schemas";
import { getApiErrorMessage, register as apiRegister } from "@/lib/api";
import { setToken, setUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });
  const mutation = useMutation({
    mutationFn: ({ email, password }: RegisterForm) => apiRegister(email, password),
    onSuccess: (data) => {
      setToken(data.access_token);
      setUser(data.user);
      router.push("/dashboard");
    },
    onError: (err: unknown) => {
      setError("root", { message: getApiErrorMessage(err, "Не удалось зарегистрироваться. Попробуйте снова.") });
    },
  });

  return (
    <div className="container max-w-md mx-auto py-12 px-4">
      <div className="mb-6 text-center">
        <Link href="/" className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
          VERAE
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Регистрация</CardTitle>
          <p className="text-sm text-muted-foreground">Бесплатно, без карты</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
              {errors.password
                ? <p className="text-sm text-destructive">{errors.password.message}</p>
                : <p className="text-xs text-muted-foreground">Минимум 8 символов, буквы и цифры</p>
              }
            </div>
            {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Регистрация…" : "Зарегистрироваться"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground text-center">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="underline">Войти</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
