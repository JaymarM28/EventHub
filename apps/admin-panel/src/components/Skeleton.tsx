export function Skeleton({ width, height = 14, radius = 8 }: { width?: number | string; height?: number; radius?: number }) {
  return <div className="skeleton" style={{ width: width ?? '100%', height, borderRadius: radius }} />;
}

/** Silueta de una tabla mientras carga — filas x columnas de barras, en
 * vez de un simple "Cargando…" que no anticipa la forma del contenido. */
export function TableSkeleton({ rows = 4, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <table>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}>
                <Skeleton width={c === 0 ? '70%' : '50%'} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
