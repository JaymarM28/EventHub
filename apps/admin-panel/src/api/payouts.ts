import { apiClient } from './client';

export type BankAccountType = 'SAVINGS' | 'CHECKING';

export interface PayoutAccount {
  id: string;
  organizerId: string;
  accountType: BankAccountType;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  legalIdType: string;
  legalId: string;
  fullName: string;
  email: string;
}

export interface PayoutAccountInput {
  accountType: BankAccountType;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  legalIdType: string;
  legalId: string;
  fullName: string;
  email: string;
}

export interface PendingPayoutSummary {
  pendingAmount: string;
  ordersCount: number;
}

export type PayoutStatus = 'PENDING' | 'SETTLED';

export interface Payout {
  id: string;
  organizerId: string;
  totalAmount: string;
  ordersCount: number;
  status: PayoutStatus;
  externalReference: string | null;
  notes: string | null;
  createdAt: string;
  settledAt: string | null;
}

export async function getMyPayoutAccount(): Promise<PayoutAccount | null> {
  const response = await apiClient.get<PayoutAccount | null>('/orders/payout-account/me');
  return response.data;
}

export async function upsertMyPayoutAccount(input: PayoutAccountInput): Promise<PayoutAccount> {
  const response = await apiClient.put<PayoutAccount>('/orders/payout-account/me', input);
  return response.data;
}

export async function getPendingPayoutSummary(zoneIds: string[]): Promise<PendingPayoutSummary> {
  if (zoneIds.length === 0) return { pendingAmount: '0', ordersCount: 0 };
  const response = await apiClient.get<PendingPayoutSummary>('/orders/payouts/summary', {
    params: { zoneIds: zoneIds.join(',') },
  });
  return response.data;
}

export async function listMyPayouts(organizerId?: string): Promise<Payout[]> {
  const response = await apiClient.get<Payout[]>('/orders/payouts', {
    params: organizerId ? { organizerId } : undefined,
  });
  return response.data;
}

/** Solo SUPER_ADMIN — ver PayoutsController.settle en orders-service. */
export async function settlePayout(input: {
  organizerId: string;
  zoneIds: string[];
  externalReference: string;
  notes?: string;
}): Promise<Payout> {
  const response = await apiClient.post<Payout>('/orders/payouts/settle', input);
  return response.data;
}

export interface PlatformRevenue {
  totalRevenue: string;
  paidOrdersCount: number;
  last30DaysRevenue: string;
}

/** Solo SUPER_ADMIN — ver PayoutsController.platformRevenue en orders-service. */
export async function getPlatformRevenue(): Promise<PlatformRevenue> {
  const response = await apiClient.get<PlatformRevenue>('/orders/payouts/platform-revenue');
  return response.data;
}
