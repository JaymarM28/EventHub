import { useRef, useState } from 'react';
import { extractErrorMessage } from '../api/client';
import { useToast } from './Toast';

/**
 * Reemplaza el input de texto "pegá una URL" — sube el archivo de verdad
 * a R2 (ver storage.service.ts) y devuelve la URL real ya subida. Pedido
 * explícito del usuario: con URL pegada a mano, una imagen que no era un
 * link directo (ej. una página de resultados de Google Images) rompía
 * silenciosamente el mapa de secciones sin ningún aviso.
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  upload,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  upload: (file: File) => Promise<string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo si falla
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await upload(file);
      onChange(url);
      showToast('Imagen subida');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label>{label}</label>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        {value && (
          <img
            src={value}
            alt=""
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
          />
        )}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Subiendo…' : value ? 'Cambiar imagen' : 'Subir imagen'}
        </button>
        {value && (
          <button type="button" className="btn-ghost" onClick={() => onChange('')}>
            Quitar
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFileSelected}
          style={{ display: 'none' }}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
