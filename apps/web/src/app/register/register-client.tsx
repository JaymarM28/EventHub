"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function RegisterClient() {
  const { register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  // Legal (2026-10-01) — mismo campo obligatorio que register_screen.dart
  // en mobile; el backend igual lo rechaza con 400 si llega `false` (ver
  // PublicRegisterDto en auth-service).
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!acceptedTerms) {
      setError("Tenés que aceptar los Términos y la Política de Privacidad");
      return;
    }
    setLoading(true);
    try {
      await register({
        email,
        password,
        firstName,
        lastName,
        birthDate,
        acceptedTerms,
      });
      const from = searchParams.get("from");
      router.push(from && from.startsWith("/") ? from : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-violet-500";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-7">
        <h1 className="text-2xl font-bold">Crear cuenta</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Registrate para empezar a comprar boletos.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-300">
              Nombre
            </label>
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300">
              Apellido
            </label>
            <input
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300">
            Fecha de nacimiento
          </label>
          <input
            type="date"
            required
            max={new Date().toISOString().split("T")[0]}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300">
            Contraseña (mínimo 8 caracteres)
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1"
          />
          <span>
            Acepto los{" "}
            <a
              href={`${API_URL}/legal/terms`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-violet-400 hover:text-violet-300"
            >
              Términos y Condiciones
            </a>{" "}
            y la{" "}
            <a
              href={`${API_URL}/legal/privacy`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-violet-400 hover:text-violet-300"
            >
              Política de Privacidad
            </a>
          </span>
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-violet-600 py-2.5 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
        >
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

        <p className="mt-6 text-sm text-neutral-400">
          ¿Ya tenés cuenta?{" "}
          <Link
            href={`/login${searchParams.get("from") ? `?from=${encodeURIComponent(searchParams.get("from")!)}` : ""}`}
            className="font-medium text-violet-400 hover:text-violet-300"
          >
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
