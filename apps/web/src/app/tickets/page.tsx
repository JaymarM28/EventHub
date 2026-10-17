"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getEvent } from "@/lib/api";
import { authFetch } from "@/lib/auth-client";
import { useAuth } from "@/lib/auth-context";
import type { EventSummary, Ticket } from "@/lib/types";

interface PurchaseGroup {
  orderId: string;
  event: EventSummary | null;
  tickets: Ticket[];
}

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export default function MyTicketsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<PurchaseGroup[] | null>(null);
  const [error, setError] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?from=/tickets");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const tickets = await authFetch<Ticket[]>("/tickets/mine");
        const byOrder = new Map<string, Ticket[]>();
        for (const ticket of tickets) {
          const list = byOrder.get(ticket.orderId) ?? [];
          list.push(ticket);
          byOrder.set(ticket.orderId, list);
        }

        const eventCache = new Map<string, EventSummary>();
        const result: PurchaseGroup[] = [];
        for (const [orderId, group] of byOrder) {
          const eventId = group[0].eventId;
          let event: EventSummary | null = null;
          if (eventId) {
            event = eventCache.get(eventId) ?? null;
            if (!event) {
              try {
                event = await getEvent(eventId);
                eventCache.set(eventId, event);
              } catch {
                event = null;
              }
            }
          }
          result.push({ orderId, event, tickets: group });
        }
        result.sort((a, b) => {
          const aDate = a.event ? new Date(a.event.startsAt).getTime() : 0;
          const bDate = b.event ? new Date(b.event.startsAt).getTime() : 0;
          return bDate - aDate;
        });
        if (!cancelled) setGroups(result);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-bold">Mis boletos</h1>

      {error && (
        <p className="mt-6 text-neutral-400">No se pudieron cargar tus boletos.</p>
      )}
      {!error && groups === null && (
        <p className="mt-6 text-neutral-400">Cargando…</p>
      )}
      {!error && groups !== null && groups.length === 0 && (
        <p className="mt-6 text-neutral-400">Todavía no tenés boletos.</p>
      )}

      <div className="mt-6 space-y-4">
        {groups?.map((group) => {
          const allRefunded = group.tickets.every((t) => t.refundedAt);
          const allUsed = group.tickets.every((t) => t.scannedAt);
          // Pedido del usuario (2026-09-28, mobile): el boleto se habilita
          // recién 6h antes del evento — mismo criterio acá.
          const availableAt = group.event
            ? new Date(new Date(group.event.startsAt).getTime() - 6 * 60 * 60 * 1000)
            : null;
          // El resultado puede variar entre renders (el tiempo pasa) — a
          // propósito, es justo lo que necesitamos para que el boleto se
          // "desbloquee" solo sin recargar la página.
          // eslint-disable-next-line react-hooks/purity
          const isAvailable = !availableAt || Date.now() >= availableAt.getTime();

          return (
            <div
              key={group.orderId}
              className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <p className="font-semibold">
                {group.event?.title ?? "Evento"}
              </p>
              {group.event && (
                <p className="text-sm text-neutral-400">
                  {dateFormatter.format(new Date(group.event.startsAt))} ·{" "}
                  {group.event.venue}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-violet-950 px-3 py-1 text-xs font-semibold text-violet-300">
                  {group.tickets[0]?.zoneName} × {group.tickets.length}
                </span>
                {allRefunded ? (
                  <span className="text-xs font-semibold text-red-400">
                    Reembolsado
                  </span>
                ) : allUsed ? (
                  <span className="text-xs text-neutral-500">Usado</span>
                ) : !isAvailable && availableAt ? (
                  <span className="text-xs text-neutral-500">
                    Disponible {dateFormatter.format(availableAt)}
                  </span>
                ) : null}
              </div>

              {!allRefunded && isAvailable && (
                <button
                  onClick={() =>
                    setOpenTicketId(
                      openTicketId === group.orderId ? null : group.orderId,
                    )
                  }
                  className="mt-3 text-sm font-medium text-violet-400 hover:text-violet-300"
                >
                  {openTicketId === group.orderId ? "Ocultar QR" : "Ver QR"}
                </button>
              )}

              {openTicketId === group.orderId && (
                <div className="mt-4 space-y-4">
                  {group.tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex justify-center rounded-xl bg-white p-4"
                    >
                      <QRCodeSVG value={ticket.qrToken} size={180} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
