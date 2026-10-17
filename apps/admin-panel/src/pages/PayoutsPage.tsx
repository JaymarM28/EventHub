import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listUsers, type PlatformUser } from '../api/admin';
import { findMyEvents, listAllEvents, type EventItem } from '../api/events';
import {
  getMyPayoutAccount,
  getPendingPayoutSummary,
  getPlatformRevenue,
  listMyPayouts,
  settlePayout,
  upsertMyPayoutAccount,
  type BankAccountType,
  type Payout,
  type PayoutAccount,
  type PlatformRevenue,
} from '../api/payouts';
import { extractErrorMessage } from '../api/client';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

/**
 * #24 (modelo de negocio, TODOS.md #13) — cuenta de cobro del organizador +
 * cuánto se le debe, y (solo SUPER_ADMIN) la pantalla para liquidar a
 * cualquier organizador. La liquidación es MANUAL por ahora: registra que
 * VOS ya transferiste la plata por fuera de la plataforma — todavía no
 * dispara la API de Payouts de Wompi (fees/límites sin confirmar).
 */
export function PayoutsPage() {
  const { isSuperAdmin } = useAuth();

  return (
    <div className="page">
      <div className="page-header">
        <p className="eyebrow">Cobros</p>
        <h1>Liquidaciones</h1>
        <p className="muted">
          Tu cuenta bancaria para recibir pagos, y cuánto tenés pendiente de cobrar (el cargo por servicio nunca se
          descuenta de tu parte).
        </p>
      </div>
      <div className="stack-lg">
        {isSuperAdmin && <PlatformRevenueSection />}
        <MyPayoutAccountSection />
        <MyBalanceSection />
        {isSuperAdmin && <SettlementsSection />}
      </div>
    </div>
  );
}

const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  SAVINGS: 'Ahorros',
  CHECKING: 'Corriente',
};

/** Solo SUPER_ADMIN — cuánto genera la PLATAFORMA (Event Hub), no la parte
 * de ningún organizador. Ver PayoutsService.platformRevenue. */
function PlatformRevenueSection() {
  const [revenue, setRevenue] = useState<PlatformRevenue | null>(null);

  useEffect(() => {
    getPlatformRevenue()
      .then(setRevenue)
      .catch(() => setRevenue(null));
  }, []);

  return (
    <div className="card">
      <div className="section-header" style={{ marginBottom: 16 }}>
        <p className="eyebrow">Super admin</p>
        <h2>Ingresos de la plataforma</h2>
        <p className="subtitle">Lo que genera Event Hub por cargo de servicio — nunca la parte del organizador.</p>
      </div>
      {revenue === null ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div className="row" style={{ gap: 32 }}>
          <div>
            <p className="muted" style={{ margin: '0 0 4px' }}>
              Total histórico
            </p>
            <p style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>
              ${Number(revenue.totalRevenue).toLocaleString('es-CO')}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {revenue.paidOrdersCount} orden(es) pagada(s)
            </p>
          </div>
          <div>
            <p className="muted" style={{ margin: '0 0 4px' }}>
              Últimos 30 días
            </p>
            <p style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>
              ${Number(revenue.last30DaysRevenue).toLocaleString('es-CO')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MyPayoutAccountSection() {
  const [account, setAccount] = useState<PayoutAccount | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const { showToast } = useToast();

  const reload = () => {
    getMyPayoutAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  };

  useEffect(reload, []);

  return (
    <div className="card">
      <div className="row-between section-header" style={{ marginBottom: 16 }}>
        <div>
          <h2>Mi cuenta de cobro</h2>
          <p className="subtitle">A dónde te transferimos tu parte de las ventas.</p>
        </div>
        {account !== undefined && account !== null && !editing && (
          <button className="btn-secondary" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
      </div>

      {account === undefined && <p className="muted">Cargando…</p>}
      {account === null && !editing && (
        <p className="empty-state">Todavía no cargaste tu cuenta de cobro.</p>
      )}

      {(editing || account === null) && (
        <PayoutAccountForm
          initial={account ?? undefined}
          onDone={(saved) => {
            setAccount(saved);
            setEditing(false);
            showToast('Cuenta de cobro guardada');
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {account && !editing && (
        <dl className="detail-grid">
          <dt>Titular</dt>
          <dd>{account.fullName}</dd>
          <dt>Identificación</dt>
          <dd>
            {account.legalIdType} {account.legalId}
          </dd>
          <dt>Banco</dt>
          <dd>{account.bankName}</dd>
          <dt>Cuenta</dt>
          <dd>
            {BANK_ACCOUNT_TYPE_LABELS[account.accountType]} •••• {account.accountNumber.slice(-4)}
          </dd>
          <dt>Email</dt>
          <dd>{account.email}</dd>
        </dl>
      )}
    </div>
  );
}

function PayoutAccountForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: PayoutAccount;
  onDone: (account: PayoutAccount) => void;
  onCancel: () => void;
}) {
  const [accountType, setAccountType] = useState<BankAccountType>(initial?.accountType ?? 'SAVINGS');
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? '');
  const [bankCode, setBankCode] = useState(initial?.bankCode ?? '');
  const [bankName, setBankName] = useState(initial?.bankName ?? '');
  const [legalIdType, setLegalIdType] = useState(initial?.legalIdType ?? 'CC');
  const [legalId, setLegalId] = useState(initial?.legalId ?? '');
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const saved = await upsertMyPayoutAccount({
        accountType,
        accountNumber,
        bankCode,
        bankName,
        legalIdType,
        legalId,
        fullName,
        email,
      });
      onDone(saved);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="stack" onSubmit={onSubmit} style={{ gap: 12 }}>
      <div className="row">
        <div style={{ flex: 2 }}>
          <label>Nombre completo del titular</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div style={{ flex: 1 }}>
          <label>Tipo de identificación</label>
          <select value={legalIdType} onChange={(e) => setLegalIdType(e.target.value)}>
            <option value="CC">CC</option>
            <option value="CE">CE</option>
            <option value="NIT">NIT</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label>Número de identificación</label>
          <input value={legalId} onChange={(e) => setLegalId(e.target.value)} required />
        </div>
      </div>
      <div className="row">
        <div style={{ flex: 2 }}>
          <label>Banco</label>
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} required placeholder="Bancolombia" />
        </div>
        <div style={{ flex: 1 }}>
          <label>Código del banco</label>
          <input value={bankCode} onChange={(e) => setBankCode(e.target.value)} required />
        </div>
        <div style={{ flex: 1 }}>
          <label>Tipo de cuenta</label>
          <select value={accountType} onChange={(e) => setAccountType(e.target.value as BankAccountType)}>
            <option value="SAVINGS">Ahorros</option>
            <option value="CHECKING">Corriente</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label>Número de cuenta</label>
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required />
        </div>
      </div>
      <div>
        <label>Email de contacto</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar cuenta de cobro'}
        </button>
        {initial && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function MyBalanceSection() {
  const [pendingAmount, setPendingAmount] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);

  useEffect(() => {
    findMyEvents()
      .then((events) => {
        const zoneIds = events.flatMap((e) => e.zones.map((z) => z.id));
        return getPendingPayoutSummary(zoneIds);
      })
      .then((summary) => setPendingAmount(summary.pendingAmount))
      .catch(() => setPendingAmount('0'));
    listMyPayouts()
      .then(setPayouts)
      .catch(() => setPayouts([]));
  }, []);

  return (
    <div className="card">
      <div className="section-header" style={{ marginBottom: 16 }}>
        <h2>Mi saldo</h2>
        <p className="subtitle">Lo que ya vendiste y todavía no se te liquidó.</p>
      </div>
      <p style={{ fontSize: 32, fontWeight: 700, margin: '0 0 16px' }}>
        {pendingAmount === null ? '—' : `$${Number(pendingAmount).toLocaleString('es-CO')}`}
      </p>

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Historial de liquidaciones</h3>
      {payouts === null && <p className="muted">Cargando…</p>}
      {payouts && payouts.length === 0 && <p className="empty-state">Todavía no se te liquidó ninguna venta.</p>}
      {payouts && payouts.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Monto</th>
              <th>Órdenes</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id}>
                <td className="muted">{new Date(p.createdAt).toLocaleDateString('es')}</td>
                <td>${Number(p.totalAmount).toLocaleString('es-CO')}</td>
                <td className="muted">{p.ordersCount}</td>
                <td className="muted">{p.externalReference ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Solo SUPER_ADMIN — liquidar a cualquier organizador. `GET /events`
 * (público) trae `organizerId` + `zones` de TODOS los eventos, así se
 * arma el mapa organizerId → zoneIds sin un endpoint nuevo. */
function SettlementsSection() {
  const [organizers, setOrganizers] = useState<PlatformUser[]>([]);
  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState('');
  const [summary, setSummary] = useState<{ pendingAmount: string; ordersCount: number } | null>(null);
  const [settling, setSettling] = useState(false);
  const { showToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    listUsers().then((users) => setOrganizers(users.filter((u) => u.roles.includes('ORGANIZER'))));
    listAllEvents().then(setAllEvents);
  }, []);

  const zoneIdsForSelected = useMemo(() => {
    if (!selectedOrganizerId) return [];
    return allEvents.filter((e) => e.organizerId === selectedOrganizerId).flatMap((e) => e.zones.map((z) => z.id));
  }, [allEvents, selectedOrganizerId]);

  useEffect(() => {
    if (zoneIdsForSelected.length === 0) return;
    getPendingPayoutSummary(zoneIdsForSelected).then(setSummary);
  }, [zoneIdsForSelected]);
  // Derivado, no estado propio — evita mostrar el saldo del organizador
  // anterior mientras se elige uno nuevo sin zonas (o ninguno todavía).
  const effectiveSummary = zoneIdsForSelected.length === 0 ? null : summary;

  const onSettle = async () => {
    const externalReference = window.prompt(
      'Número de comprobante de la transferencia que ya hiciste por fuera de la plataforma:',
    );
    if (!externalReference) return;
    const ok = await confirm({
      title: 'Marcar como liquidado',
      message: `Esto registra que ya le transferiste $${Number(effectiveSummary?.pendingAmount ?? 0).toLocaleString(
        'es-CO',
      )} a este organizador — no dispara ninguna transferencia real, solo lo marca liquidado en el sistema. ¿Confirmás?`,
      confirmLabel: 'Sí, ya transferí',
    });
    if (!ok) return;
    setSettling(true);
    try {
      await settlePayout({ organizerId: selectedOrganizerId, zoneIds: zoneIdsForSelected, externalReference });
      showToast('Liquidación registrada');
      const refreshed = await getPendingPayoutSummary(zoneIdsForSelected);
      setSummary(refreshed);
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="card">
      <div className="section-header" style={{ marginBottom: 16 }}>
        <p className="eyebrow">Super admin</p>
        <h2>Liquidar a un organizador</h2>
        <p className="subtitle">
          Registra que ya le transferiste su plata por fuera — todavía manual (ver TODOS.md #13). Solo cuenta lo
          pagado hace más de unos días (colchón contra reembolsos tardíos — ver{' '}
          <code>PAYOUT_HOLD_DAYS</code> en orders-service).
        </p>
      </div>
      <div className="row" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label>Organizador</label>
          <select value={selectedOrganizerId} onChange={(e) => setSelectedOrganizerId(e.target.value)}>
            <option value="">Elegí un organizador…</option>
            {organizers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.firstName} {o.lastName} ({o.email})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedOrganizerId && effectiveSummary && (
        <div className="row-between" style={{ alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
              ${Number(effectiveSummary.pendingAmount).toLocaleString('es-CO')}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {effectiveSummary.ordersCount} orden(es) pendiente(s) de liquidar
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={onSettle}
            disabled={settling || Number(effectiveSummary.pendingAmount) <= 0}
          >
            {settling ? 'Registrando…' : 'Marcar como liquidado'}
          </button>
        </div>
      )}
      {selectedOrganizerId && !effectiveSummary && (
        <p className="muted">Este organizador no tiene ventas pendientes.</p>
      )}
    </div>
  );
}
