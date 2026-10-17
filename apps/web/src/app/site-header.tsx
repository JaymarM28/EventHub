"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

function initialOf(email: string): string {
  return email.charAt(0).toUpperCase() || "?";
}

export function SiteHeader() {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 text-sm font-bold text-white">
            E
          </span>
          <span className="text-lg font-bold tracking-tight">Event Hub</span>
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="hidden text-neutral-300 hover:text-white sm:inline">
            Eventos
          </Link>
          {!loading && user && (
            <Link href="/tickets" className="hidden text-neutral-300 hover:text-white sm:inline">
              Mis boletos
            </Link>
          )}

          {loading ? null : user ? (
            <Link
              href="/profile"
              aria-label="Mi perfil"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-sm font-bold text-white transition hover:opacity-90"
            >
              {initialOf(user.email)}
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-violet-600 px-4 py-1.5 font-medium text-white hover:bg-violet-500"
            >
              Ingresar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
