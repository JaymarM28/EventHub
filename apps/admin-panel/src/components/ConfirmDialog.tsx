import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Modal de confirmación promise-based — reemplaza `window.confirm` para
 * que las acciones sensibles (ej. sacarte a vos mismo el rol SUPER_ADMIN)
 * usen el mismo lenguaje visual que el resto del panel en vez del diálogo
 * nativo del navegador. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<(value: boolean) => void>(() => {});

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolveRef.current(value);
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div className="modal-overlay" onClick={() => close(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: 8 }}>{options.title}</h2>
            <p className="muted" style={{ marginBottom: 20 }}>
              {options.message}
            </p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => close(false)}>
                Cancelar
              </button>
              <button className={options.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>
                {options.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx;
}
