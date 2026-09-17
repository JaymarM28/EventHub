import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createEvent, findMyEvents, type EventItem, type ZoneDraft } from '../api/events';
import { extractErrorMessage } from '../api/client';

const emptyZone = (): ZoneDraft => ({ name: '', price: 0, capacity: 0 });

export function MyEventsPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  const reload = () => {
    findMyEvents().then(setEvents);
  };

  useEffect(reload, []);

  return (
    <div className="page">
      <div className="row-between" style={{ marginBottom: 20 }}>
        <h1>Mis eventos</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : '+ Nuevo evento'}
        </button>
      </div>

      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <CreateEventForm
            onCreated={(event) => {
              setShowForm(false);
              reload();
              navigate(`/events/${event.id}`);
            }}
          />
        </div>
      )}

      {events === null && <p className="muted">Cargando…</p>}
      {events?.length === 0 && <p className="muted">Todavía no creaste ningún evento.</p>}

      <div className="stack">
        {events?.map((event) => (
          <Link key={event.id} to={`/events/${event.id}`} className="card row-between" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div>
              <h3>{event.title}</h3>
              <p className="muted">
                {event.venue} · {new Date(event.startsAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
            <span className="badge badge-accent">{event.zones.length} zonas</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CreateEventForm({ onCreated }: { onCreated: (event: EventItem) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [zones, setZones] = useState<ZoneDraft[]>([emptyZone()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateZone = (index: number, patch: Partial<ZoneDraft>) => {
    setZones((prev) => prev.map((z, i) => (i === index ? { ...z, ...patch } : z)));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const event = await createEvent({
        title,
        description: description || undefined,
        venue,
        startsAt: new Date(startsAt).toISOString(),
        zones,
      });
      onCreated(event);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="stack card" onSubmit={onSubmit}>
      <h2>Nuevo evento</h2>
      <div>
        <label htmlFor="title">Título</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="description">Descripción (opcional)</label>
        <textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="row">
        <div style={{ flex: 1 }}>
          <label htmlFor="venue">Lugar</label>
          <input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} required />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="startsAt">Fecha y hora</label>
          <input
            id="startsAt"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </div>
      </div>

      <h3>Zonas</h3>
      {zones.map((zone, i) => (
        <div className="row" key={i}>
          <div style={{ flex: 2 }}>
            <label>Nombre</label>
            <input value={zone.name} onChange={(e) => updateZone(i, { name: e.target.value })} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>Precio</label>
            <input
              type="number"
              min={0}
              value={zone.price}
              onChange={(e) => updateZone(i, { price: Number(e.target.value) })}
              required
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Cupos</label>
            <input
              type="number"
              min={1}
              value={zone.capacity}
              onChange={(e) => updateZone(i, { capacity: Number(e.target.value) })}
              required
            />
          </div>
          {zones.length > 1 && (
            <button
              type="button"
              className="btn-danger"
              style={{ marginTop: 18 }}
              onClick={() => setZones((prev) => prev.filter((_, idx) => idx !== i))}
            >
              Quitar
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setZones((prev) => [...prev, emptyZone()])}>
        + Agregar zona
      </button>

      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" type="submit" disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? 'Creando…' : 'Crear evento'}
      </button>
    </form>
  );
}
