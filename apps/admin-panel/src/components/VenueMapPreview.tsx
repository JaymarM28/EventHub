import type { VenueSection, VenueSectionPoint } from '../api/venues';

/** Paleta fija por índice — no depende de datos, así una sección
 * mantiene el mismo color entre renders sin guardar nada extra. */
export const SECTION_COLORS = ['#7C6FF0', '#3DD68C', '#E8A94A', '#FF6B6B', '#4AC3E8', '#C77DFF', '#F5A3C7', '#8FE8A0'];

export function pointsToSvgPath(points: VenueSectionPoint[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${p.y * 100}`).join(' ') + ' Z';
}

/** Mapa de secciones de solo lectura — reusado por el editor (VenueMapPage,
 * que le agrega la capa de dibujo encima) y por la creación de eventos
 * (MyEventsPage, para elegir a qué sección corresponde cada zona). */
export function VenueMapPreview({
  mapImageUrl,
  sections,
  venueName,
  highlightedSectionId,
  onSectionClick,
}: {
  mapImageUrl: string;
  sections: VenueSection[];
  venueName: string;
  highlightedSectionId?: string | null;
  onSectionClick?: (section: VenueSection) => void;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 720,
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <img src={mapImageUrl} alt={venueName} style={{ width: '100%', display: 'block' }} draggable={false} />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {sections.map((section, i) => (
          <path
            key={section.id}
            d={pointsToSvgPath(section.points)}
            fill={SECTION_COLORS[i % SECTION_COLORS.length]}
            fillOpacity={highlightedSectionId === section.id ? 0.6 : 0.3}
            stroke={SECTION_COLORS[i % SECTION_COLORS.length]}
            strokeWidth={0.3}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: onSectionClick ? 'pointer' : 'default' }}
            onClick={() => onSectionClick?.(section)}
          >
            <title>{section.name}</title>
          </path>
        ))}
      </svg>
    </div>
  );
}
