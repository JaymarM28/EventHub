import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createEvent,
  findMyEvents,
  EVENT_CATEGORY_LABELS,
  type EventCategory,
  type EventItem,
  type ZoneDraft,
} from '../api/events';
import { getVenue, listVenues, type Venue } from '../api/venues';
import { extractErrorMessage } from '../api/client';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { VenueMapPreview } from '../components/VenueMapPreview';

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
      <div className="row-between page-header" style={{ marginBottom: 20 }}>
        <div>
          <p className="eyebrow">Organizador</p>
          <h1>Mis eventos</h1>
        </div>
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

      {events === null && (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card row" style={{ gap: 14 }}>
              <Skeleton width={52} height={56} radius={14} />
              <div style={{ flex: 1 }}>
                <Skeleton width={180} height={16} />
                <div style={{ marginTop: 6 }}>
                  <Skeleton width={220} height={13} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {events?.length === 0 && <p className="empty-state">Todavía no creaste ningún evento.</p>}

      <div className="stack">
        {events?.map((event) => {
          const startsAt = new Date(event.startsAt);
          return (
            <Link key={event.id} to={`/events/${event.id}`} className="card card-link row-between">
              <div className="row" style={{ gap: 14 }}>
                <span className="date-badge">
                  <span className="month">{startsAt.toLocaleDateString('es', { month: 'short' }).replace('.', '')}</span>
                  <span className="day">{startsAt.getDate()}</span>
                </span>
                <div>
                  <h3>{event.title}</h3>
                  <p className="muted">
                    {event.venue} · {startsAt.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
              <span className="badge badge-accent">{event.zones.length} zonas</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CreateEventForm({ onCreated }: { onCreated: (event: EventItem) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState<EventCategory>('MUSICA');
  const [startsAt, setStartsAt] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [galleryImageUrls, setGalleryImageUrls] = useState('');
  const [zones, setZones] = useState<ZoneDraft[]>([emptyZone()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [venueId, setVenueId] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  useEffect(() => {
    listVenues().then(setVenues).catch(() => {});
  }, []);

  const onSelectVenue = async (id: string) => {
    setVenueId(id);
    if (!id) {
      setSelectedVenue(null);
      return;
    }
    const full = await getVenue(id);
    setSelectedVenue(full);
    if (venue.trim() === '') setVenue(full.name);
    // Un evento nuevo con establecimiento del catálogo no debería empezar
    // con zonas ya vinculadas a secciones de OTRO establecimiento (podía
    // pasar si el organizador cambia de idea a mitad de armar el form).
    setZones((prev) => prev.map((z) => ({ ...z, venueSectionId: undefined })));
  };

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
        venueId: venueId || undefined,
        city,
        category,
        startsAt: new Date(startsAt).toISOString(),
        zones,
        coverImageUrl: coverImageUrl || undefined,
        galleryImageUrls: galleryImageUrls
          .split(',')
          .map((url) => url.trim())
          .filter(Boolean),
      });
      showToast(`${title} creado`);
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
          <label htmlFor="city">Ciudad</label>
          <input id="city" value={city} onChange={(e) => setCity(e.target.value)} required />
        </div>
      </div>
      <div>
        <label htmlFor="venueId">Establecimiento del catálogo (opcional — habilita mapa de secciones)</label>
        <select id="venueId" value={venueId} onChange={(e) => onSelectVenue(e.target.value)}>
          <option value="">— Sin establecimiento del catálogo —</option>
          {(venues ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      {selectedVenue?.mapImageUrl && (selectedVenue.sections?.length ?? 0) > 0 && (
        <div>
          <p className="subtitle" style={{ marginBottom: 8 }}>
            Elegí abajo, por cada zona, a qué sección del mapa corresponde.
          </p>
          <VenueMapPreview
            mapImageUrl={selectedVenue.mapImageUrl}
            sections={selectedVenue.sections ?? []}
            venueName={selectedVenue.name}
          />
        </div>
      )}
      <div className="row">
        <div style={{ flex: 1 }}>
          <label htmlFor="category">Categoría</label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
            {Object.entries(EVENT_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
      <div className="row">
        <div style={{ flex: 1 }}>
          <label htmlFor="coverImageUrl">URL de portada (opcional)</label>
          <input
            id="coverImageUrl"
            type="url"
            placeholder="https://..."
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="galleryImageUrls">Galería (URLs separadas por coma, opcional)</label>
          <input
            id="galleryImageUrls"
            placeholder="https://..., https://..."
            value={galleryImageUrls}
            onChange={(e) => setGalleryImageUrls(e.target.value)}
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
          {(selectedVenue?.sections?.length ?? 0) > 0 && (
            <div style={{ flex: 1 }}>
              <label>Sección del mapa</label>
              <select
                value={zone.venueSectionId ?? ''}
                onChange={(e) => updateZone(i, { venueSectionId: e.target.value || undefined })}
              >
                <option value="">— Ninguna —</option>
                {(selectedVenue?.sections ?? []).map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
