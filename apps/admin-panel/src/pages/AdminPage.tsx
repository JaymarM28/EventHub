import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createOrganizer, listUsers, updateUserRoles, type PlatformUser } from '../api/admin';
import { createVenue, listVenues, updateVenue, type Venue, type VenueInput } from '../api/venues';
import { extractErrorMessage } from '../api/client';
import { Pagination, usePagination } from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { useAuth } from '../auth/AuthContext';

const ALL_ROLES = ['SUPER_ADMIN', 'ORGANIZER', 'STAFF', 'VENDOR', 'ATTENDEE'] as const;

export function AdminPage() {
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [venues, setVenues] = useState<Venue[] | null>(null);

  const reloadUsers = () => {
    listUsers().then(setUsers);
  };
  const reloadVenues = () => {
    listVenues().then(setVenues);
  };

  useEffect(() => {
    reloadUsers();
    reloadVenues();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <p className="eyebrow">Super admin</p>
        <h1>Administración de la plataforma</h1>
        <p className="muted">Organizadores, usuarios y establecimientos de todo Event Hub.</p>
      </div>
      <div className="stack-lg">
        <OrganizersSection users={users} onCreated={reloadUsers} />
        <UsersSection users={users} onRolesChanged={reloadUsers} />
        <VenuesSection venues={venues} onChanged={reloadVenues} />
      </div>
    </div>
  );
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function OrganizersSection({ users, onCreated }: { users: PlatformUser[] | null; onCreated: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const organizers = users?.filter((u) => u.roles.includes('ORGANIZER')) ?? [];
  const { page, setPage, totalPages, pageItems } = usePagination(organizers);

  return (
    <div className="card">
      <div className="row-between section-header" style={{ marginBottom: 16 }}>
        <div>
          <h2>Organizadores</h2>
          <p className="subtitle">Quién puede crear y administrar sus propios eventos.</p>
        </div>
        <button className="btn-secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : '+ Crear organizador'}
        </button>
      </div>

      {showForm && (
        <CreateOrganizerForm
          onCreated={() => {
            setShowForm(false);
            onCreated();
          }}
        />
      )}

      {users === null && <TableSkeleton cols={3} />}
      {users && organizers.length === 0 && !showForm && (
        <p className="empty-state">Todavía no hay organizadores.</p>
      )}
      {organizers.length > 0 && (
        <>
          <table style={{ marginTop: showForm ? 16 : 0 }}>
            <thead>
              <tr>
                <th>Organizador</th>
                <th>Email</th>
                <th>Creado</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="avatar">{initials(u.firstName, u.lastName)}</span>
                      <span>
                        {u.firstName} {u.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="muted">{u.email}</td>
                  <td className="muted">{new Date(u.createdAt).toLocaleDateString('es')}</td>
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

function CreateOrganizerForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createOrganizer({ email, password, firstName, lastName, birthDate });
      showToast(`Organizador ${firstName} ${lastName} creado`);
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="stack" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <div className="row">
        <div style={{ flex: 1 }}>
          <label>Nombre</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </div>
        <div style={{ flex: 1 }}>
          <label>Apellido</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </div>
      </div>
      <div className="row">
        <div style={{ flex: 2 }}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div style={{ flex: 1 }}>
          <label>Fecha de nacimiento</label>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
        </div>
      </div>
      <div>
        <label>Contraseña inicial</label>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <p className="muted" style={{ marginTop: 4 }}>
          Comunicásela vos mismo — todavía no hay envío de email real (Fase B del roadmap).
        </p>
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" type="submit" disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? 'Creando…' : 'Crear organizador'}
      </button>
    </form>
  );
}

function UsersSection({
  users,
  onRolesChanged,
}: {
  users: PlatformUser[] | null;
  onRolesChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) => u.email.toLowerCase().includes(q) || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q),
    );
  }, [users, query]);
  const { page, setPage, totalPages, pageItems } = usePagination(filtered);

  return (
    <div className="card">
      <div className="section-header" style={{ marginBottom: 16 }}>
        <h2>Todos los usuarios</h2>
        <p className="subtitle">Cada cuenta de la plataforma y sus roles activos.</p>
      </div>
      {users === null && <TableSkeleton cols={4} />}
      {users && (
        <input
          className="search-bar"
          placeholder="Buscar por nombre o email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {users && filtered.length === 0 && (
        <p className="empty-state">Ningún usuario coincide con "{query}".</p>
      )}
      {filtered.length > 0 && (
        <>
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Roles</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((u) =>
              editingId === u.id ? (
                <EditRolesRow
                  key={u.id}
                  user={u}
                  onDone={() => {
                    setEditingId(null);
                    onRolesChanged();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <tr key={u.id}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="avatar">{initials(u.firstName, u.lastName)}</span>
                      <span>
                        {u.firstName} {u.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="muted">{u.email}</td>
                  <td>
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className={`badge ${r === 'SUPER_ADMIN' ? 'badge-accent' : 'badge-outline'}`}
                        style={{ marginRight: 4 }}
                      >
                        {r}
                      </span>
                    ))}
                  </td>
                  <td>
                    <button className="btn-ghost" onClick={() => setEditingId(u.id)}>
                      Editar roles
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function EditRolesRow({
  user,
  onDone,
  onCancel,
}: {
  user: PlatformUser;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { user: currentUser } = useAuth();

  const toggle = (role: string) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const onSave = async () => {
    if (roles.length === 0) {
      setError('Un usuario debe tener al menos un rol');
      return;
    }
    // Sacarte a vos mismo el rol SUPER_ADMIN te deja afuera del panel sin
    // forma de revertirlo desde la UI — merece un freno explícito, no un
    // click accidental (ver feedback del usuario).
    const removesOwnSuperAdmin =
      currentUser?.userId === user.id && user.roles.includes('SUPER_ADMIN') && !roles.includes('SUPER_ADMIN');
    if (removesOwnSuperAdmin) {
      const ok = await confirm({
        title: 'Te vas a sacar el rol de SUPER_ADMIN',
        message: 'Vas a perder acceso a esta pantalla de administración. No hay forma de revertirlo desde acá.',
        confirmLabel: 'Sacarme el rol',
        danger: true,
      });
      if (!ok) return;
    }

    setError(null);
    setLoading(true);
    try {
      await updateUserRoles(user.id, roles);
      showToast(`Roles de ${user.email} actualizados`);
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <tr>
      <td colSpan={4}>
        <div className="row" style={{ padding: '4px 0', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ marginRight: 8 }}>{user.email}</strong>
          {ALL_ROLES.map((role) => (
            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 12 }}>
              <input type="checkbox" checked={roles.includes(role)} onChange={() => toggle(role)} />
              {role}
            </label>
          ))}
          <button className="btn-primary" onClick={onSave} disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
          <button className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </td>
    </tr>
  );
}

function VenuesSection({ venues, onChanged }: { venues: Venue[] | null; onChanged: () => void }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { page, setPage, totalPages, pageItems } = usePagination(venues ?? []);

  return (
    <div className="card">
      <div className="row-between section-header" style={{ marginBottom: 16 }}>
        <div>
          <h2>Establecimientos</h2>
          <p className="subtitle">Catálogo de venues — todavía sin ligar a eventos (ver roadmap #18).</p>
        </div>
        <button className="btn-secondary" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? 'Cancelar' : '+ Agregar establecimiento'}
        </button>
      </div>

      {showAddForm && (
        <VenueForm
          onSubmit={createVenue}
          onDone={() => {
            setShowAddForm(false);
            onChanged();
          }}
          onCancel={() => setShowAddForm(false)}
          submitLabel="Crear"
        />
      )}

      {venues === null && <TableSkeleton cols={3} />}
      {venues && venues.length === 0 && !showAddForm && (
        <p className="empty-state">Todavía no hay establecimientos cargados.</p>
      )}
      {venues && venues.length > 0 && (
        <>
        <table style={{ marginTop: showAddForm ? 16 : 0 }}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Dirección</th>
              <th>Capacidad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((venue) =>
              editingId === venue.id ? (
                <tr key={venue.id}>
                  <td colSpan={4}>
                    <VenueForm
                      initial={venue}
                      onSubmit={(input) => updateVenue(venue.id, input)}
                      onDone={() => {
                        setEditingId(null);
                        onChanged();
                      }}
                      onCancel={() => setEditingId(null)}
                      submitLabel="Guardar"
                      inline
                    />
                  </td>
                </tr>
              ) : (
                <tr key={venue.id}>
                  <td>{venue.name}</td>
                  <td>{venue.address}</td>
                  <td>{venue.capacity ?? '—'}</td>
                  <td>
                    <button className="btn-ghost" onClick={() => setEditingId(venue.id)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function VenueForm({
  initial,
  onSubmit,
  onDone,
  onCancel,
  submitLabel,
  inline,
}: {
  initial?: Venue;
  onSubmit: (input: VenueInput) => Promise<Venue>;
  onDone: () => void;
  onCancel: () => void;
  submitLabel: string;
  inline?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [capacity, setCapacity] = useState<number | ''>(initial?.capacity ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const onSave = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit({ name, address, capacity: capacity === '' ? undefined : Number(capacity) });
      showToast(initial ? `${name} actualizado` : `${name} agregado`);
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="row" onSubmit={onSave} style={{ marginBottom: inline ? 0 : 16, alignItems: 'flex-end' }}>
      <div style={{ flex: 2 }}>
        <label>Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div style={{ flex: 2 }}>
        <label>Dirección</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} required />
      </div>
      <div style={{ flex: 1 }}>
        <label>Capacidad (opcional)</label>
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </div>
      <button className="btn-primary" type="submit" disabled={loading}>
        {loading ? 'Guardando…' : submitLabel}
      </button>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        Cancelar
      </button>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
