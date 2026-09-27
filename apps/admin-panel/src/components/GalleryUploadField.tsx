import { useRef, useState } from 'react';
import { extractErrorMessage } from '../api/client';
import { uploadEventImage } from '../api/uploads';
import { useToast } from './Toast';

/** Igual criterio que ImageUploadField pero para varias imágenes — ya no
 * es "pegá URLs separadas por coma", cada una se sube de verdad. */
export function GalleryUploadField({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadEventImage(file);
      onChange([...images, url]);
      showToast('Imagen agregada a la galería');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label>Galería (opcional)</label>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {images.map((url, i) => (
          <div key={url} style={{ position: 'relative' }}>
            <img
              src={url}
              alt=""
              style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <button
              type="button"
              className="btn-danger"
              style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 11 }}
              onClick={() => onChange(images.filter((_, idx) => idx !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Subiendo…' : '+ Agregar imagen'}
        </button>
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
