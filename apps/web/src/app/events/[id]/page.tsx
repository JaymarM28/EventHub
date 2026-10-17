import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, getEvent } from "@/lib/api";
import { EVENT_CATEGORY_LABELS } from "@/lib/types";
import { BuyWidget } from "./buy-widget";

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

type Params = Promise<{ id: string }>;

/** SEO (TODOS.md #10, "compartir evento") — esta es la razón de ser de
 * toda la versión web: un link que alguien SIN la app pueda abrir y vea
 * de qué se trata el evento, con título/imagen reales en la vista previa
 * (WhatsApp, Twitter, etc. leen estos tags de Open Graph). */
export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const event = await getEvent(id);
    return {
      title: event.title,
      description:
        event.description ?? `${event.title} — ${event.venue}, en Event Hub.`,
      openGraph: {
        title: event.title,
        description: event.description ?? undefined,
        images: event.coverImageUrl ? [event.coverImageUrl] : undefined,
      },
    };
  } catch {
    return { title: "Evento no encontrado" };
  }
}

export default async function EventDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  let event;
  try {
    event = await getEvent(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 hover:text-white"
      >
        ← Volver a eventos
      </Link>

      <div className="relative mb-6 aspect-[16/9] overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-violet-400">
        {event.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- dominio dinámico (R2)
          <img
            src={event.coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          {event.category && (
            <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur">
              {EVENT_CATEGORY_LABELS[event.category]}
            </span>
          )}
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {event.title}
          </h1>
        </div>
      </div>

      {event.cancelledAt && (
        <div className="mb-4 rounded-2xl border border-red-800 bg-red-950 px-4 py-3 text-sm font-medium text-red-300">
          Este evento fue cancelado.
        </div>
      )}

      <p className="text-neutral-300">
        {event.city ? `${event.venue}, ${event.city}` : event.venue}
      </p>
      <p className="text-neutral-400">
        {dateFormatter.format(new Date(event.startsAt))}
      </p>

      {event.description && (
        <>
          <h2 className="mt-8 text-lg font-semibold">Acerca del evento</h2>
          <p className="mt-2 whitespace-pre-line text-neutral-300">
            {event.description}
          </p>
        </>
      )}

      <h2 className="mt-8 text-lg font-semibold">Zonas</h2>
      <ul className="mt-3 space-y-2">
        {event.zones.map((zone) => (
          <li
            key={zone.id}
            className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3.5"
          >
            <div>
              <p className="font-medium">{zone.name}</p>
              <p className="text-sm text-neutral-400">{zone.capacity} cupos</p>
            </div>
            <p className="text-lg font-semibold text-violet-300">
              ${Number(zone.price).toLocaleString("es-CO")}
            </p>
          </li>
        ))}
      </ul>

      {!event.cancelledAt && <BuyWidget eventId={event.id} zones={event.zones} />}
    </div>
  );
}
