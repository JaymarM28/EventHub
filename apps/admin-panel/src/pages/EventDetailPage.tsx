import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addStaff,
  addZone,
  findEvent,
  getDashboard,
  listStaff,
  updateEvent,
  updateZone,
  type AddStaffInput,
  type EventDashboard,
  type EventItem,
  type StaffMember,
  type ZoneDraft,
} from '../api/events';
import { extractErrorMessage } from '../api/client';
import { useDashboardSocket } from '../hooks/useDashboardSocket';

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [dashboard, setDashboard] = useState<EventDashboard | null>(null);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  const eventId = id!;

  const reloadDashboard = useCallback(() => {
    getDashboard(eventId).then(setDashboard).catch(() => {});
  }, [eventId]);

  useEffect(() => {
    findEvent(eventId).then(setEvent).catch(() => setNotFound(true));
    reloadDashboard();
    listStaff(eventId).then(setStaff).catch(() => {});
  }, [eventId, reloadDashboard]);

  // Ventas/aforo en vivo (fase stretch de DESIGN.md): api-gateway avisa
  // por WebSocket cuando se emite un boleto nuevo de este evento — acá
  // solo se vuelve a pedir el dashboard, no se intenta reconstruir el
  // estado a mano a partir del payload del socket.
  useDashboardSocket(eventId, reloadDashboard);

  if (notFound) {
    return (
      <div className="page">
        <p>No se pudo cargar este evento (¿no existe, o no sos el organizador?).</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>
          Volver a mis eventos
        </button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="page">
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="page stack" style={{ gap: 24 }}>
      <button className="btn-ghost" style={{ alignSelf: 'flex-start', padding: '4px 0' }} onClick={() => navigate('/')}>
        ← Mis eventos
      </button>

      <EventHeader event={event} onUpdated={setEvent} />
      <DashboardSection eventId={eventId} dashboard={dashboard} onZonesChanged={reloadDashboard} />
      <StaffSection eventId={eventId} staff={staff} onStaffAdded={(s) => setStaff((prev) => [...(prev ?? []), s])} />
    </div>
  );
}

function EventHeader({ event, onUpdated }: { event: EventItem; onUpdated: (event: EventItem) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [venue, setVenue] = useState(event.venue);
  const [description, setDescription] = useState(event.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const updated = await updateEvent(event.id, { title, venue, description });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!editing) {
    return (
      <div className="card row-between">
        <div>
          <h1>{event.title}</h1>
          <p className="muted">
            {event.venue} · {new Date(event.startsAt).toLocaleString('es', { dateStyle: 'full', timeStyle: 'short' })}
          </p>
          {event.description && <p style={{ marginTop: 8 }}>{event.description}</p>}
        </div>
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          Editar
        </button>
      </div>
    );
  }

  return (
    <form className="stack card" onSubmit={onSubmit}>
      <div>
        <label htmlFor="edit-title">Título</label>
        <input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="edit-venue">Lugar</label>
        <input id="edit-venue" value={venue} onChange={(e) => setVenue(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="edit-description">Descripción</label>
        <textarea id="edit-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar'}
        </button>
        <button className="btn-ghost" type="button" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function DashboardSection({
  eventId,
  dashboard,
  onZonesChanged,
}: {
  eventId: string;
  dashboard: EventDashboard | null;
  onZonesChanged: () => void;
}) {
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [showAddZone, setShowAddZone] = useState(false);

  return (
    <div className="card">
      <h2>Ventas y aforo</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        Se actualiza solo cuando se vende un boleto — sin recargar la página.
      </p>
      {!dashboard && <p className="muted">Cargando…</p>}
      {dashboard && (
        <>
          <div className="row" style={{ marginBottom: 16, gap: 24 }}>
            <Stat label="Vendidos" value={`${dashboard.totalSold} / ${dashboard.totalCapacity}`} />
            <Stat label="Ingresos" value={formatMoney(dashboard.totalRevenue)} />
          </div>
          <table>
            <thead>
              <tr>
                <th>Zona</th>
                <th>Precio</th>
                <th>Vendidos</th>
                <th>Cupo</th>
                <th>Ingresos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dashboard.zones.map((zone) =>
                editingZoneId === zone.zoneId ? (
                  <EditZoneRow
                    key={zone.zoneId}
                    eventId={eventId}
                    zone={zone}
                    onDone={() => {
                      setEditingZoneId(null);
                      onZonesChanged();
                    }}
                    onCancel={() => setEditingZoneId(null)}
                  />
                ) : (
                  <tr key={zone.zoneId}>
                    <td>{zone.name}</td>
                    <td>{formatMoney(Number(zone.price))}</td>
                    <td>{zone.sold}</td>
                    <td>{zone.capacity}</td>
                    <td>{formatMoney(zone.revenue)}</td>
                    <td>
                      <button className="btn-ghost" onClick={() => setEditingZoneId(zone.zoneId)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          {showAddZone ? (
            <AddZoneForm
              eventId={eventId}
              onDone={() => {
                setShowAddZone(false);
                onZonesChanged();
              }}
              onCancel={() => setShowAddZone(false)}
            />
          ) : (
            <button className="btn-secondary" style={{ marginTop: 16 }} onClick={() => setShowAddZone(true)}>
              + Agregar zona
            </button>
          )}
        </>
      )}
    </div>
  );
}

function EditZoneRow({
  eventId,
  zone,
  onDone,
  onCancel,
}: {
  eventId: string;
  zone: EventDashboard['zones'][number];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(zone.name);
  const [price, setPrice] = useState(Number(zone.price));
  const [capacity, setCapacity] = useState(zone.capacity);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSave = async () => {
    setError(null);
    setLoading(true);
    try {
      await updateZone(eventId, zone.zoneId, { name, price, capacity });
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <tr>
      <td colSpan={6}>
        <div className="row" style={{ padding: '4px 0' }}>
          <input style={{ flex: 2 }} value={name} onChange={(e) => setName(e.target.value)} />
          <input
            style={{ flex: 1 }}
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
          <input
            style={{ flex: 1 }}
            type="number"
            min={zone.sold}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
          <button className="btn-primary" onClick={onSave} disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
          <button className="btn-ghost" onClick={onCancel} type="button">
            Cancelar
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        <p className="muted" style={{ fontSize: 12 }}>
          El cupo no puede bajar de {zone.sold} (ya vendidos).
        </p>
      </td>
    </tr>
  );
}

function AddZoneForm({ eventId, onDone, onCancel }: { eventId: string; onDone: () => void; onCancel: () => void }) {
  const [zone, setZone] = useState<ZoneDraft>({ name: '', price: 0, capacity: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await addZone(eventId, zone);
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="row" onSubmit={onSubmit} style={{ marginTop: 16 }}>
      <div style={{ flex: 2 }}>
        <label>Nombre</label>
        <input value={zone.name} onChange={(e) => setZone({ ...zone, name: e.target.value })} required />
      </div>
      <div style={{ flex: 1 }}>
        <label>Precio</label>
        <input
          type="number"
          min={0}
          value={zone.price}
          onChange={(e) => setZone({ ...zone, price: Number(e.target.value) })}
          required
        />
      </div>
      <div style={{ flex: 1 }}>
        <label>Cupos</label>
        <input
          type="number"
          min={1}
          value={zone.capacity}
          onChange={(e) => setZone({ ...zone, capacity: Number(e.target.value) })}
          required
        />
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Creando…' : 'Crear'}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function StaffSection({
  eventId,
  staff,
  onStaffAdded,
}: {
  eventId: string;
  staff: StaffMember[] | null;
  onStaffAdded: (staff: StaffMember) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="card">
      <div className="row-between" style={{ marginBottom: 16 }}>
        <h2>Staff (control de acceso)</h2>
        <button className="btn-secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : '+ Agregar staff'}
        </button>
      </div>

      {showForm && (
        <AddStaffForm
          eventId={eventId}
          onAdded={(s) => {
            onStaffAdded(s);
            setShowForm(false);
          }}
        />
      )}

      {staff === null && <p className="muted">Cargando…</p>}
      {staff?.length === 0 && !showForm && (
        <p className="muted">Todavía no agregaste a nadie — solo vos podés escanear boletos de este evento.</p>
      )}
      {staff && staff.length > 0 && (
        <table style={{ marginTop: showForm ? 16 : 0 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Agregado</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.email}</td>
                <td>{new Date(s.createdAt).toLocaleDateString('es')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AddStaffForm({ eventId, onAdded }: { eventId: string; onAdded: (staff: StaffMember) => void }) {
  const [form, setForm] = useState<AddStaffInput>({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    birthDate: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const created = await addStaff(eventId, form);
      onAdded(created);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="stack" onSubmit={onSubmit} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
      <p className="muted" style={{ fontSize: 13 }}>
        Vas a crear una cuenta nueva con esta contraseña — comunícasela a la persona por fuera de la app.
      </p>
      <div className="row">
        <div style={{ flex: 1 }}>
          <label>Nombre</label>
          <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </div>
        <div style={{ flex: 1 }}>
          <label>Apellido</label>
          <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </div>
      </div>
      <div>
        <label>Fecha de nacimiento</label>
        <input
          type="date"
          value={form.birthDate}
          onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
          required
        />
      </div>
      <div>
        <label>Email</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </div>
      <div>
        <label>Contraseña (mínimo 8 caracteres)</label>
        <input
          type="password"
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" type="submit" disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? 'Creando…' : 'Crear cuenta de staff'}
      </button>
    </form>
  );
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}
