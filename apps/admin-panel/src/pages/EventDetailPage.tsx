import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addStaff,
  addZone,
  createDiscountCode,
  findEvent,
  getDashboard,
  listDiscountCodes,
  listStaff,
  setDiscountCodeActive,
  updateEvent,
  updateZone,
  EVENT_CATEGORY_LABELS,
  type AddStaffInput,
  type CreateDiscountCodeInput,
  type DiscountCode,
  type DiscountType,
  type EventCategory,
  type EventDashboard,
  type EventItem,
  type StaffMember,
  type ZoneDraft,
} from '../api/events';
import { extractErrorMessage } from '../api/client';
import { useDashboardSocket } from '../hooks/useDashboardSocket';
import { Pagination, usePagination } from '../components/Pagination';
import { Skeleton, TableSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { SalesChart } from '../components/SalesChart';
import { downloadCsv } from '../components/csv';

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [dashboard, setDashboard] = useState<EventDashboard | null>(null);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  const eventId = id!;

  const reloadDashboard = useCallback(() => {
    getDashboard(eventId).then(setDashboard).catch(() => {});
  }, [eventId]);

  const reloadDiscountCodes = useCallback(() => {
    listDiscountCodes(eventId).then(setDiscountCodes).catch(() => {});
  }, [eventId]);

  useEffect(() => {
    findEvent(eventId).then(setEvent).catch(() => setNotFound(true));
    reloadDashboard();
    listStaff(eventId).then(setStaff).catch(() => {});
    reloadDiscountCodes();
  }, [eventId, reloadDashboard, reloadDiscountCodes]);

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
      <div className="page stack-lg">
        <div className="card">
          <Skeleton height={22} width={240} />
          <div style={{ marginTop: 10 }}>
            <Skeleton height={14} width={160} />
          </div>
        </div>
        <div className="card">
          <Skeleton height={18} width={140} />
          <div style={{ marginTop: 16 }}>
            <TableSkeleton cols={5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page stack" style={{ gap: 24 }}>
      <button className="btn-ghost" style={{ alignSelf: 'flex-start', padding: '4px 0' }} onClick={() => navigate('/')}>
        ← Mis eventos
      </button>

      <EventHeader event={event} onUpdated={setEvent} />
      <DashboardSection
        eventId={eventId}
        eventTitle={event.title}
        venueRef={event.venueRef}
        dashboard={dashboard}
        onZonesChanged={reloadDashboard}
      />
      <StaffSection eventId={eventId} staff={staff} onStaffAdded={(s) => setStaff((prev) => [...(prev ?? []), s])} />
      <DiscountCodesSection eventId={eventId} codes={discountCodes} onChanged={reloadDiscountCodes} />
    </div>
  );
}

function EventHeader({ event, onUpdated }: { event: EventItem; onUpdated: (event: EventItem) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [venue, setVenue] = useState(event.venue);
  const [city, setCity] = useState(event.city ?? '');
  const [category, setCategory] = useState<EventCategory>(event.category ?? 'OTRO');
  const [description, setDescription] = useState(event.description ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(event.coverImageUrl ?? '');
  const [galleryImageUrls, setGalleryImageUrls] = useState(event.galleryImageUrls.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const updated = await updateEvent(event.id, {
        title,
        venue,
        city,
        category,
        description,
        coverImageUrl: coverImageUrl || undefined,
        galleryImageUrls: galleryImageUrls
          .split(',')
          .map((url) => url.trim())
          .filter(Boolean),
      });
      onUpdated(updated);
      showToast('Evento actualizado');
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
        {event.coverImageUrl && (
          <img
            src={event.coverImageUrl}
            alt=""
            style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12, marginRight: 16 }}
          />
        )}
        <div>
          <h1>{event.title}</h1>
          <p className="muted">
            {event.venue}
            {event.city ? `, ${event.city}` : ''} ·{' '}
            {new Date(event.startsAt).toLocaleString('es', { dateStyle: 'full', timeStyle: 'short' })}
            {event.category ? ` · ${EVENT_CATEGORY_LABELS[event.category]}` : ''}
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
      <div className="row">
        <div style={{ flex: 1 }}>
          <label htmlFor="edit-venue">Lugar</label>
          <input id="edit-venue" value={venue} onChange={(e) => setVenue(e.target.value)} required />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="edit-city">Ciudad</label>
          <input id="edit-city" value={city} onChange={(e) => setCity(e.target.value)} required />
        </div>
      </div>
      <div>
        <label htmlFor="edit-category">Categoría</label>
        <select
          id="edit-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as EventCategory)}
        >
          {Object.entries(EVENT_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="edit-description">Descripción</label>
        <textarea id="edit-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="row">
        <div style={{ flex: 1 }}>
          <label htmlFor="edit-coverImageUrl">URL de portada</label>
          <input
            id="edit-coverImageUrl"
            type="url"
            placeholder="https://..."
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="edit-galleryImageUrls">Galería (URLs separadas por coma)</label>
          <input
            id="edit-galleryImageUrls"
            placeholder="https://..., https://..."
            value={galleryImageUrls}
            onChange={(e) => setGalleryImageUrls(e.target.value)}
          />
        </div>
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
  eventTitle,
  venueRef,
  dashboard,
  onZonesChanged,
}: {
  eventId: string;
  eventTitle: string;
  venueRef: EventItem['venueRef'];
  dashboard: EventDashboard | null;
  onZonesChanged: () => void;
}) {
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [showAddZone, setShowAddZone] = useState(false);

  const exportZonesCsv = () => {
    if (!dashboard) return;
    downloadCsv(
      `ventas-${slugify(eventTitle)}.csv`,
      ['Zona', 'Precio', 'Vendidos', 'Cupo', 'Ingresos'],
      dashboard.zones.map((z) => [z.name, Number(z.price), z.sold, z.capacity, z.revenue]),
    );
  };

  const exportTimelineCsv = () => {
    if (!dashboard) return;
    downloadCsv(
      `ventas-por-dia-${slugify(eventTitle)}.csv`,
      ['Día', 'Boletos vendidos', 'Ingresos'],
      dashboard.salesTimeline.map((e) => [e.day, e.sold, e.revenue]),
    );
  };

  return (
    <div className="card">
      <div className="section-header row-between">
        <div>
          <h2>Ventas y aforo</h2>
          <p className="subtitle">Se actualiza solo cuando se vende un boleto — sin recargar la página.</p>
        </div>
        {dashboard && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn-ghost" onClick={exportZonesCsv}>
              Exportar zonas (CSV)
            </button>
            <button className="btn-ghost" onClick={exportTimelineCsv} disabled={dashboard.salesTimeline.length === 0}>
              Exportar ventas por día (CSV)
            </button>
          </div>
        )}
      </div>
      {!dashboard && <div style={{ marginTop: 16 }}><TableSkeleton cols={6} /></div>}
      {dashboard && (
        <>
          <div className="row" style={{ marginTop: 16, marginBottom: 20, gap: 12 }}>
            <Stat label="Vendidos" value={`${dashboard.totalSold} / ${dashboard.totalCapacity}`} />
            <Stat label="Ingresos" value={formatMoney(dashboard.totalRevenue)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <SalesChart entries={dashboard.salesTimeline} />
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
                    venueRef={venueRef}
                    onDone={() => {
                      setEditingZoneId(null);
                      onZonesChanged();
                    }}
                    onCancel={() => setEditingZoneId(null)}
                  />
                ) : (
                  <tr key={zone.zoneId}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span
                          style={{
                            width: 4,
                            height: 18,
                            borderRadius: 4,
                            background: 'linear-gradient(135deg, var(--accent), var(--accent-bright))',
                          }}
                        />
                        {zone.name}
                      </div>
                    </td>
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
              venueRef={venueRef}
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
  venueRef,
  onDone,
  onCancel,
}: {
  eventId: string;
  zone: EventDashboard['zones'][number];
  venueRef: EventItem['venueRef'];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(zone.name);
  const [price, setPrice] = useState(Number(zone.price));
  const [capacity, setCapacity] = useState(zone.capacity);
  const [venueSectionId, setVenueSectionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const onSave = async () => {
    setError(null);
    setLoading(true);
    try {
      await updateZone(eventId, zone.zoneId, {
        name,
        price,
        capacity,
        ...(venueSectionId !== '' && { venueSectionId }),
      });
      showToast(`Zona ${name} actualizada`);
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
          {(venueRef?.sections?.length ?? 0) > 0 && (
            <select style={{ flex: 1 }} value={venueSectionId} onChange={(e) => setVenueSectionId(e.target.value)}>
              <option value="">— Sección sin cambios —</option>
              {(venueRef?.sections ?? []).map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          )}
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

function AddZoneForm({
  eventId,
  venueRef,
  onDone,
  onCancel,
}: {
  eventId: string;
  venueRef: EventItem['venueRef'];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [zone, setZone] = useState<ZoneDraft>({ name: '', price: 0, capacity: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await addZone(eventId, zone);
      showToast(`Zona ${zone.name} agregada`);
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
      {(venueRef?.sections?.length ?? 0) > 0 && (
        <div style={{ flex: 1 }}>
          <label>Sección del mapa</label>
          <select
            value={zone.venueSectionId ?? ''}
            onChange={(e) => setZone({ ...zone, venueSectionId: e.target.value || undefined })}
          >
            <option value="">— Ninguna —</option>
            {(venueRef?.sections ?? []).map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </div>
      )}
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
    <div
      style={{
        flex: 1,
        minWidth: 140,
        padding: '14px 16px',
        borderRadius: 14,
        background: 'var(--background)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-bright)', marginTop: 2 }}>{value}</div>
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
  const { page, setPage, totalPages, pageItems } = usePagination(staff ?? []);

  return (
    <div className="card">
      <div className="row-between section-header" style={{ marginBottom: 16 }}>
        <div>
          <h2>Staff (control de acceso)</h2>
          <p className="subtitle">Quién más puede escanear boletos en la puerta de este evento.</p>
        </div>
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

      {staff === null && <TableSkeleton cols={2} />}
      {staff?.length === 0 && !showForm && (
        <p className="empty-state">Todavía no agregaste a nadie — solo vos podés escanear boletos de este evento.</p>
      )}
      {staff && staff.length > 0 && (
        <>
        <table style={{ marginTop: showForm ? 16 : 0 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Agregado</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="avatar">{s.email.charAt(0).toUpperCase()}</span>
                    {s.email}
                  </div>
                </td>
                <td>{new Date(s.createdAt).toLocaleDateString('es')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
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
  const { showToast } = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const created = await addStaff(eventId, form);
      showToast(`${form.email} agregado como staff`);
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

function DiscountCodesSection({
  eventId,
  codes,
  onChanged,
}: {
  eventId: string;
  codes: DiscountCode[] | null;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { page, setPage, totalPages, pageItems } = usePagination(codes ?? []);
  const { showToast } = useToast();

  // Antes esto no manejaba el error de la request ni mostraba loading —
  // si fallaba, no se enteraba nadie (ni un mensaje, ni el botón se
  // trababa esperando).
  const toggleActive = async (code: DiscountCode) => {
    setTogglingId(code.id);
    try {
      await setDiscountCodeActive(eventId, code.id, !code.active);
      showToast(`${code.code} ${code.active ? 'desactivado' : 'activado'}`);
      onChanged();
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="card">
      <div className="row-between section-header" style={{ marginBottom: 16 }}>
        <div>
          <h2>Códigos de descuento</h2>
          <p className="subtitle">Porcentaje o monto fijo, con límite de usos opcional.</p>
        </div>
        <button className="btn-secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : '+ Nuevo código'}
        </button>
      </div>

      {showForm && (
        <CreateDiscountCodeForm
          eventId={eventId}
          onCreated={() => {
            setShowForm(false);
            onChanged();
          }}
        />
      )}

      {codes === null && <TableSkeleton cols={5} />}
      {codes?.length === 0 && !showForm && (
        <p className="empty-state">Todavía no creaste ningún código de descuento.</p>
      )}
      {codes && codes.length > 0 && (
        <>
        <table style={{ marginTop: showForm ? 16 : 0 }}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descuento</th>
              <th>Usos</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((code) => (
              <tr key={code.id}>
                <td>
                  <span className="badge badge-accent">{code.code}</span>
                </td>
                <td>{code.type === 'PERCENTAGE' ? `${code.value}%` : formatMoney(Number(code.value))}</td>
                <td>
                  {code.usedCount}
                  {code.maxUses !== null ? ` / ${code.maxUses}` : ' (ilimitado)'}
                </td>
                <td>
                  <span className={`badge ${code.active ? 'badge-accent' : 'badge-outline'}`}>
                    {code.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <button className="btn-ghost" disabled={togglingId === code.id} onClick={() => toggleActive(code)}>
                    {togglingId === code.id ? '...' : code.active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function CreateDiscountCodeForm({ eventId, onCreated }: { eventId: string; onCreated: () => void }) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<DiscountType>('PERCENTAGE');
  const [value, setValue] = useState(10);
  const [maxUses, setMaxUses] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const input: CreateDiscountCodeInput = { code, type, value };
      if (maxUses.trim() !== '') input.maxUses = Number(maxUses);
      await createDiscountCode(eventId, input);
      showToast(`Código ${code.toUpperCase()} creado`);
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="row" onSubmit={onSubmit} style={{ marginBottom: 16, alignItems: 'flex-end' }}>
      <div style={{ flex: 2 }}>
        <label>Código</label>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="AMIGOS20" required />
      </div>
      <div style={{ flex: 1 }}>
        <label>Tipo</label>
        <select value={type} onChange={(e) => setType(e.target.value as DiscountType)}>
          <option value="PERCENTAGE">Porcentaje</option>
          <option value="FIXED">Monto fijo</option>
        </select>
      </div>
      <div style={{ flex: 1 }}>
        <label>{type === 'PERCENTAGE' ? 'Porcentaje (%)' : 'Monto'}</label>
        <input
          type="number"
          min={0}
          max={type === 'PERCENTAGE' ? 100 : undefined}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          required
        />
      </div>
      <div style={{ flex: 1 }}>
        <label>Usos máx. (opcional)</label>
        <input
          type="number"
          min={1}
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder="Ilimitado"
        />
      </div>
      <button className="btn-primary" type="submit" disabled={loading}>
        {loading ? 'Creando…' : 'Crear'}
      </button>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
