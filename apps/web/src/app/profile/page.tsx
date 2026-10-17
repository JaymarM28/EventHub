"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Administrador",
  ORGANIZER: "Organizador",
  STAFF: "Staff",
  VENDOR: "Vendedor",
  ATTENDEE: "Comprador",
};

function tileClassName(danger?: boolean): string {
  return `flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-sm font-medium transition ${
    danger
      ? "border-red-900/60 bg-red-950/40 text-red-300 hover:border-red-700"
      : "border-neutral-800 bg-neutral-900 text-neutral-100 hover:border-violet-600"
  }`;
}

function ProfileLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={tileClassName()}>
      <span>{label}</span>
      <span className="text-neutral-500">›</span>
    </Link>
  );
}

function ProfileExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={tileClassName()}>
      <span>{label}</span>
      <span className="text-neutral-500">›</span>
    </a>
  );
}

function ProfileAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={tileClassName(true)}>
      <span>{label}</span>
    </button>
  );
}

/** Pantalla de perfil (pedido del usuario, 2026-10-03: "no tengo forma de
 * mi perfil") — mismo criterio que profile_screen.dart en mobile: sin
 * edición de datos (el backend no tiene endpoint para eso todavía), es
 * identidad + accesos directos + cerrar sesión. */
export default function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login?from=/profile");
  }, [loading, user, router]);

  if (loading || !user) return null;

  const roleLabels = user.roles.map((r) => ROLE_LABELS[r] ?? r);

  return (
    <div className="mx-auto w-full max-w-sm flex-1 px-6 py-12">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-3xl font-bold text-white">
          {user.email.charAt(0).toUpperCase()}
        </span>
        <p className="mt-4 text-lg font-semibold">{user.email}</p>
        {roleLabels.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {roleLabels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-violet-950 px-3 py-1 text-xs font-semibold text-violet-300"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-10 space-y-3">
        <ProfileLink href="/tickets" label="Mis boletos" />
        <ProfileExternalLink href={`${API_URL}/legal/terms`} label="Términos y condiciones" />
        <ProfileExternalLink href={`${API_URL}/legal/privacy`} label="Política de privacidad" />
      </div>

      <div className="mt-8">
        <ProfileAction
          label="Cerrar sesión"
          onClick={() => {
            logout();
            router.push("/");
          }}
        />
      </div>
    </div>
  );
}
