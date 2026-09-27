import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createVenueSection,
  getVenue,
  updateVenueSection,
  type Venue,
  type VenueSection,
  type VenueSectionPoint,
} from '../api/venues';
import { extractErrorMessage } from '../api/client';
import { TableSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { SECTION_COLORS, pointsToSvgPath } from '../components/VenueMapPreview';

export function VenueMapPage() {
  const { id } = useParams<{ id: string }>();
  const venueId = id!;
  const navigate = useNavigate();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [draftPoints, setDraftPoints] = useState<VenueSectionPoint[]>([]);
  const [draftName, setDraftName] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { showToast } = useToast();

  const reload = () => {
    setImageError(false);
    getVenue(venueId).then(setVenue).catch(() => setNotFound(true));
  };

  useEffect(reload, [venueId]);

  const cancelDraft = () => {
    setDraftPoints([]);
    setDraftName('');
    setEditingSectionId(null);
  };

  const onImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDraftPoints((prev) => [...prev, { x, y }]);
  };

  const startEditingName = (section: VenueSection) => {
    setEditingSectionId(section.id);
    setDraftName(section.name);
    setDraftPoints([]);
  };

  const saveSection = async () => {
    if (draftName.trim() === '') return;
    setSaving(true);
    try {
      if (editingSectionId) {
        // Renombrar una sección existente — no se editan sus puntos acá,
        // solo el nombre (redibujar el polígono es "crear otra sección" en
        // este v1, ver nota del design doc de la feature).
        await updateVenueSection(venueId, editingSectionId, { name: draftName.trim() });
        showToast('Sección renombrada');
      } else {
        if (draftPoints.length < 3) {
          showToast('Marcá al menos 3 puntos para formar el polígono', 'error');
          setSaving(false);
          return;
        }
        await createVenueSection(venueId, { name: draftName.trim(), points: draftPoints });
        showToast('Sección creada');
      }
      cancelDraft();
      reload();
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="page">
        <p>No se pudo cargar este establecimiento.</p>
        <button className="btn-secondary" onClick={() => navigate('/admin')}>
          Volver a Administración
        </button>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="page stack-lg">
        <div className="card">
          <TableSkeleton cols={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="page stack" style={{ gap: 24 }}>
      <button className="btn-ghost" style={{ alignSelf: 'flex-start', padding: '4px 0' }} onClick={() => navigate('/admin')}>
        ← Administración
      </button>

      <div className="card">
        <div className="section-header">
          <h2>Mapa de secciones — {venue.name}</h2>
          <p className="subtitle">
            {!venue.mapImageUrl
              ? 'Este establecimiento todavía no tiene una imagen de mapa cargada — agregala editándolo desde Administración.'
              : imageError
                ? 'La imagen del mapa no se pudo cargar (el archivo puede estar corrupto o el link roto) — subí una imagen de nuevo desde Administración.'
                : 'Tocá el plano para marcar los vértices de una sección (mínimo 3), después ponele nombre y guardá.'}
          </p>
        </div>

        {venue.mapImageUrl && imageError && (
          <div className="empty-state" style={{ marginTop: 16 }}>
            <p>No se pudo mostrar la imagen del mapa.</p>
          </div>
        )}

        {venue.mapImageUrl && !imageError && (
          <div
            onClick={onImageClick}
            style={{
              position: 'relative',
              marginTop: 16,
              width: '100%',
              maxWidth: 720,
              cursor: editingSectionId ? 'default' : 'crosshair',
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <img
              src={venue.mapImageUrl}
              alt={venue.name}
              style={{ width: '100%', display: 'block' }}
              draggable={false}
              onError={() => setImageError(true)}
            />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            >
              {(venue.sections ?? []).map((section, i) => (
                <path
                  key={section.id}
                  d={pointsToSvgPath(section.points)}
                  fill={SECTION_COLORS[i % SECTION_COLORS.length]}
                  fillOpacity={editingSectionId === section.id ? 0.55 : 0.3}
                  stroke={SECTION_COLORS[i % SECTION_COLORS.length]}
                  strokeWidth={0.3}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {draftPoints.length > 0 && (
                <path
                  d={
                    draftPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${p.y * 100}`).join(' ') +
                    (draftPoints.length >= 3 ? ' Z' : '')
                  }
                  fill="var(--accent)"
                  fillOpacity={0.25}
                  stroke="var(--accent-bright)"
                  strokeWidth={0.4}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {draftPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x * 100}
                  cy={p.y * 100}
                  r={0.8}
                  fill="var(--accent-bright)"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          </div>
        )}

        {(draftPoints.length > 0 || editingSectionId) && (
          <div className="row" style={{ marginTop: 16, gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>Nombre de la sección</label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Ej. Platea Norte"
                autoFocus
              />
            </div>
            <button className="btn-primary" onClick={saveSection} disabled={saving || draftName.trim() === ''}>
              {saving ? 'Guardando…' : editingSectionId ? 'Renombrar' : 'Guardar sección'}
            </button>
            <button className="btn-ghost" onClick={cancelDraft}>
              Cancelar
            </button>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 8 }}>Secciones ({(venue.sections ?? []).length})</h3>
          {(venue.sections ?? []).length === 0 ? (
            <p className="empty-state">Todavía no hay secciones marcadas en este mapa.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Nombre</th>
                  <th>Vértices</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(venue.sections ?? []).map((section, i) => (
                  <tr key={section.id}>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: 4,
                          background: SECTION_COLORS[i % SECTION_COLORS.length],
                        }}
                      />
                    </td>
                    <td>{section.name}</td>
                    <td>{section.points.length}</td>
                    <td>
                      <button className="btn-ghost" onClick={() => startEditingName(section)}>
                        Renombrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
