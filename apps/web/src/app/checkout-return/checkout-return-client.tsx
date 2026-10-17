"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { authFetch } from "@/lib/auth-client";
import type { Ticket } from "@/lib/types";

/** Adónde vuelve el navegador tras pagar en Wompi (ver
 * OrdersController.checkoutReturn en orders-service, que reenvía
 * `outcome`+`orderId` acá). Arranca de cero — no hay nada del checkout
 * original en memoria, solo lo que venga en la URL. */
/** Mensaje de error ya resuelto SOLO a partir de la URL — se calcula en
 * render, no en un efecto, así evitamos el patrón "setState sincrónico
 * dentro de un efecto" para el caso que no necesita pollear nada. */
function immediateErrorMessage(
  outcome: string | null,
  orderId: string | null,
): string | null {
  if (outcome === "failure") return "El pago no se completó.";
  if (outcome === "pending") {
    return 'Tu pago está en revisión. Te vamos a avisar cuando se confirme — revisá "Mis boletos" en un rato.';
  }
  if (outcome !== "success" || !orderId) {
    return 'No pudimos confirmar tu pago. Revisá "Mis boletos" en un rato.';
  }
  return null;
}

export function CheckoutReturnClient() {
  const searchParams = useSearchParams();
  const outcome = searchParams.get("outcome");
  const orderId = searchParams.get("orderId");
  const immediateError = immediateErrorMessage(outcome, orderId);

  const [status, setStatus] = useState<"loading" | "error" | "done">(
    immediateError ? "error" : "loading",
  );
  const [message, setMessage] = useState<string | null>(immediateError);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    if (immediateError) return; // nada que pollear — ya se resolvió en render

    let cancelled = false;
    const deadline = Date.now() + 40_000;

    const poll = async () => {
      while (Date.now() < deadline) {
        if (cancelled) return;
        try {
          const all = await authFetch<Ticket[]>("/tickets/mine");
          const matching = all.filter((t) => t.orderId === orderId);
          if (matching.length > 0) {
            if (!cancelled) {
              setTickets(matching);
              setStatus("done");
            }
            return;
          }
        } catch {
          // sigue intentando — una falla de red puntual no debe cortar el polling
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) {
        setStatus("error");
        setMessage(
          'Tu pago se confirmó, pero el boleto está tardando en aparecer — revisá "Mis boletos" en un rato.',
        );
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [outcome, orderId, immediateError]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      {status === "loading" && (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-700 border-t-violet-300" />
          <p className="mt-5 text-neutral-300">Confirmando tu pago…</p>
        </>
      )}

      {status === "error" && (
        <>
          <p className="text-neutral-300">{message}</p>
          <Link
            href="/"
            className="mt-6 rounded-full bg-violet-600 px-6 py-2.5 font-semibold text-white hover:bg-violet-500"
          >
            Volver a eventos
          </Link>
        </>
      )}

      {status === "done" && (
        <>
          <h1 className="text-xl font-bold text-violet-200">
            ¡Listo! Tu boleto ya está disponible.
          </h1>
          <div className="mt-6 space-y-4">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
              >
                <p className="font-medium">{ticket.zoneName}</p>
                <div className="mt-4 flex justify-center rounded-xl bg-white p-4">
                  <QRCodeSVG value={ticket.qrToken} size={180} />
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/tickets"
            className="mt-6 inline-block rounded-full bg-violet-600 px-6 py-2.5 font-semibold text-white hover:bg-violet-500"
          >
            Ver mis boletos
          </Link>
        </>
      )}
    </div>
  );
}
