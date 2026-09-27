import { useEffect, useState } from 'react';

/** Paginación 100% client-side — las listas de este panel (usuarios,
 * organizadores, staff de un evento) ya llegan completas del backend en
 * un solo `GET`, no hay endpoint paginado del lado del servidor. Cortar
 * el array acá alcanza sin tener que tocar ninguna API todavía. */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Si la lista se achica (ej. se desactivó un filtro) y la página actual
  // queda fuera de rango, se cae a la última página válida en vez de
  // mostrar una página vacía.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
  return { page, setPage, totalPages, pageItems };
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="row-between" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <button className="btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Anterior
      </button>
      <span className="muted" style={{ fontSize: 13 }}>
        Página {page} de {totalPages}
      </span>
      <button className="btn-ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Siguiente →
      </button>
    </div>
  );
}
