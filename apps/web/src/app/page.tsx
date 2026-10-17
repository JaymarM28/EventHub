import Link from "next/link";
import { listEvents } from "@/lib/api";
import { EVENT_CATEGORY_LABELS } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export default async function HomePage() {
  const events = await listEvents();
  // Mismo criterio que la app móvil (event_list_screen.dart): activos
  // primero, ordenados por fecha más próxima — un evento que ya pasó no
  // tiene sentido ofrecerlo en la portada. `Date.now()` es correcto acá
  // a pesar de que la regla `react-hooks/purity` lo marque impuro — esto
  // es un Server Component que YA pide datos frescos en cada request
  // (`listEvents` usa `cache: 'no-store'`), no un componente cliente con
  // problemas de reconciliación entre renders.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upcoming = events
    .filter((e) => new Date(e.startsAt).getTime() > now && !e.cancelledAt)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
      <header className="mb-12 max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Tu próximo{" "}
          <span className="bg-gradient-to-r from-violet-400 to-violet-200 bg-clip-text text-transparent">
            evento
          </span>{" "}
          empieza acá
        </h1>
        <p className="mt-3 text-neutral-400">
          Encontrá los mejores conciertos y eventos, y comprá tus boletos en minutos.
        </p>
      </header>

      {upcoming.length === 0 ? (
        <p className="text-neutral-400">No hay eventos próximos todavía.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((event) => {
            const cheapest =
              event.zones.length > 0
                ? Math.min(...event.zones.map((z) => Number(z.price)))
                : null;
            return (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="group block overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:border-violet-600 hover:shadow-violet-950/40"
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-violet-600 to-violet-400">
                    {event.coverImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- dominio de imágenes dinámico (R2), no vale la pena configurar next/image todavía.
                      <img
                        src={event.coverImageUrl}
                        alt=""
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    )}
                    {event.category && (
                      <span className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur">
                        {EVENT_CATEGORY_LABELS[event.category]}
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    <h2 className="line-clamp-1 text-lg font-semibold text-neutral-50 group-hover:text-violet-300">
                      {event.title}
                    </h2>
                    <p className="mt-1 line-clamp-1 text-sm text-neutral-400">
                      {event.city ? `${event.venue}, ${event.city}` : event.venue}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {dateFormatter.format(new Date(event.startsAt))}
                    </p>
                    {cheapest !== null && (
                      <p className="mt-3 text-sm font-semibold text-violet-300">
                        Desde ${cheapest.toLocaleString("es-CO")}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
