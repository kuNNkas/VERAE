"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { loginSchema } from "@/lib/schemas";
import { getApiErrorMessage, login } from "@/lib/api";
import { setToken, setUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const mutation = useMutation({
    mutationFn: ({ email, password }: LoginForm) => login(email, password),
    onSuccess: (data) => {
      setToken(data.access_token);
      setUser(data.user);
      router.push("/dashboard");
    },
    onError: (err: unknown) => {
      setError("root", { message: getApiErrorMessage(err, "Не удалось войти. Попробуйте снова.") });
    },
  });

  return (
    <div className="container max-w-md mx-auto py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Вход</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Вход…" : "Войти"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            <Link href="/register" className="underline">Регистрация</Link>
          </p>
          {process.env.NODE_ENV === "development" && (
            <p className="mt-3 pt-3 border-t border-border text-sm text-muted-foreground">
              <Link href="/dashboard" className="underline">Для разработки: кабинет</Link>
              {" · "}
              <Link href="/form" className="underline">Форма</Link>
              {" · "}
              <Link href="/analyses" className="underline">Мои анализы</Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
