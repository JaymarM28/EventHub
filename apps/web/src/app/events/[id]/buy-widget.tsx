"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { authFetch } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth-context";
import { joinWaitlist } from "@/lib/waitlist";
import type { Zone } from "@/lib/types";

interface OrderResponse {
  id: string;
  checkoutUrl: string | null;
}

/** #24 (modelo de negocio) — SOLO para mostrar un estimado antes de
 * comprar, igual que checkout_sheet.dart en mobile; el monto real lo
 * calcula el backend (OrdersService.checkout), nunca este valor. */
const SERVICE_FEE_RATE_ESTIMATE = 0.1;

export function BuyWidget({ eventId, zones }: { eventId: string; zones: Zone[] }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [selectedZoneId, setSelectedZoneId] = useState(zones[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [discountCode, setDiscountCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soldOut, setSoldOut] = useState(false);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [joinedWaitlist, setJoinedWaitlist] = useState(false);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? zones[0];
  const maxQuantity = Math.min(selectedZone?.capacity ?? 1, 10);
  const subtotal = selectedZone ? Number(selectedZone.price) * quantity : 0;
  const serviceFee = subtotal * SERVICE_FEE_RATE_ESTIMATE;
  const total = subtotal + serviceFee;

  // #11 (2026-09-30) — mismo criterio que checkout_sheet.dart en mobile:
  // anotarse y avisar, nada más (el aviso de cupo liberado llega después
  // por notificación, ver WaitlistService en tickets-service).
  const onJoinWaitlist = async () => {
    if (!user) {
      router.push(`/login?from=/events/${eventId}`);
      return;
    }
    setJoiningWaitlist(true);
    setError(null);
    try {
      await joinWaitlist(selectedZoneId);
      setJoinedWaitlist(true);
      setSoldOut(false);
    } catch {
      setError("No se pudo anotar en la lista de espera — intentá de nuevo");
    } finally {
      setJoiningWaitlist(false);
    }
  };

  const onBuy = async () => {
    if (!user) {
      router.push(`/login?from=/events/${eventId}`);
      return;
    }
    setLoading(true);
    setError(null);
    setSoldOut(false);
    try {
      const order = await authFetch<OrderResponse>("/orders/checkout", {
        method: "POST",
        body: JSON.stringify({
          zoneId: selectedZoneId,
          quantity,
          ...(discountCode.trim() && { discountCode: discountCode.trim() }),
        }),
      });
      if (!order.checkoutUrl) {
        throw new ApiError("El servidor no devolvió un link de pago", 500);
      }
      // Redirect de página completa — Wompi no permite embeberse en un
      // iframe de forma confiable (lo bloquea por seguridad). Se retoma
      // el pedido al volver en /checkout-return (ver esa página).
      window.location.href = order.checkoutUrl;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "No se pudo iniciar la compra";
      setError(message);
      setSoldOut(message.includes("agotada"));
      setLoading(false);
    }
  };

  if (zones.length === 0) return null;

  return (
    <div className="mt-8 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="text-lg font-semibold">Comprar boletos</h2>

      <div className="mt-4">
        <label className="block text-sm font-medium text-neutral-300">Zona</label>
        <select
          value={selectedZoneId}
          onChange={(e) => {
            setSelectedZoneId(e.target.value);
            setQuantity(1);
            setSoldOut(false);
            setJoinedWaitlist(false);
            setError(null);
          }}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-violet-500"
        >
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name} — ${Number(zone.price).toLocaleString("es-CO")}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <label className="text-sm font-medium text-neutral-300">Cantidad</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-8 w-8 rounded-full border border-neutral-700 text-lg leading-none hover:border-violet-500"
          >
            −
          </button>
          <span className="w-6 text-center">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            className="h-8 w-8 rounded-full border border-neutral-700 text-lg leading-none hover:border-violet-500"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-4">
        <input
          placeholder="Código de descuento (opcional)"
          value={discountCode}
          onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-violet-500"
        />
      </div>

      <div className="mt-4 space-y-1 border-t border-neutral-800 pt-4 text-sm">
        <div className="flex justify-between text-neutral-400">
          <span>Subtotal</span>
          <span>${subtotal.toLocaleString("es-CO")}</span>
        </div>
        <div className="flex justify-between text-neutral-400">
          <span>Cargo por servicio</span>
          <span>${serviceFee.toLocaleString("es-CO")}</span>
        </div>
        <div className="flex justify-between text-base font-semibold text-violet-300">
          <span>Total</span>
          <span>${total.toLocaleString("es-CO")}</span>
        </div>
      </div>

      {error && !joinedWaitlist && (
        <p className="mt-3 text-sm text-red-400">
          {error}
          {soldOut && " — probá con otra zona o anotate en la lista de espera."}
        </p>
      )}

      {joinedWaitlist ? (
        <p className="mt-5 rounded-lg border border-violet-800 bg-violet-950 px-4 py-3 text-sm text-violet-200">
          Te anotamos en la lista de espera — te avisamos si se libera un cupo.
        </p>
      ) : (
        <button
          type="button"
          onClick={soldOut ? onJoinWaitlist : onBuy}
          disabled={loading || joiningWaitlist || authLoading}
          className="mt-5 w-full rounded-full bg-violet-600 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
        >
          {loading || joiningWaitlist
            ? "Procesando…"
            : !user
              ? "Iniciar sesión para comprar"
              : soldOut
                ? "Unirme a la lista de espera"
                : "Comprar"}
        </button>
      )}
    </div>
  );
}
