import type { SalesTimelineEntry } from '../api/events';

/**
 * Gráfico de barras simple, sin librería externa (no hay volumen que
 * justifique agregar una dependencia solo por esto — ver ETHOS "reuse
 * ladder"). Un solo SVG inline, misma paleta que el resto del panel.
 */
export function SalesChart({ entries }: { entries: SalesTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <p>Todavía no hay boletos vendidos para graficar.</p>
      </div>
    );
  }

  const width = 720;
  const height = 160;
  const paddingLeft = 8;
  const paddingBottom = 24;
  const barGap = 6;
  const maxSold = Math.max(...entries.map((e) => e.sold), 1);
  const plotWidth = width - paddingLeft * 2;
  const plotHeight = height - paddingBottom;
  const barWidth = Math.max((plotWidth - barGap * (entries.length - 1)) / entries.length, 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {entries.map((entry, i) => {
        const barHeight = (entry.sold / maxSold) * (plotHeight - 8);
        const x = paddingLeft + i * (barWidth + barGap);
        const y = plotHeight - barHeight;
        const showLabel = entries.length <= 14 || i % Math.ceil(entries.length / 14) === 0;
        return (
          <g key={entry.day}>
            <title>
              {entry.day}: {entry.sold} boletos, {formatMoney(entry.revenue)}
            </title>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 2)}
              rx={3}
              fill="url(#salesBarGradient)"
            />
            {showLabel && (
              <text
                x={x + barWidth / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={9}
                fill="var(--ink-soft)"
              >
                {entry.day.slice(5)}
              </text>
            )}
          </g>
        );
      })}
      <defs>
        <linearGradient id="salesBarGradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-bright)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
}
