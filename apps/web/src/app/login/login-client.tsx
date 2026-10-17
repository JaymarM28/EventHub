"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function LoginClient() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // Mismo criterio que login_screen.dart (mobile): volver a la página
      // desde la que se pidió iniciar sesión (ver `from` en los links de
      // "Comprar boletos"), o al inicio si no había ninguna.
      const from = searchParams.get("from");
      router.push(from && from.startsWith("/") ? from : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-7">
        <h1 className="text-2xl font-bold">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Ingresá para comprar o ver tus boletos.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300">
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-violet-500"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-violet-600 py-2.5 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-sm text-neutral-400">
          ¿No tenés cuenta?{" "}
          <Link
            href={`/register${searchParams.get("from") ? `?from=${encodeURIComponent(searchParams.get("from")!)}` : ""}`}
            className="font-medium text-violet-400 hover:text-violet-300"
          >
            Registrate
          </Link>
        </p>
      </div>
    </div>
  );
}
