import { apiClient } from './client';

export type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface Order {
  id: string;
  userId: string;
  zoneId: string;
  quantity: number;
  seatIds: string[];
  amount: string;
  currency: string;
  discountCode: string | null;
  status: OrderStatus;
  wompiTransactionId: string | null;
  refundedAt: string | null;
  createdAt: string;
}

/** #22 — soporte al comprador: órdenes pagadas/reembolsadas de las zonas
 * de un evento (el organizador necesita VER las órdenes antes de poder
 * reembolsar una puntual). */
export async function listOrdersForZones(zoneIds: string[]): Promise<Order[]> {
  if (zoneIds.length === 0) return [];
  const response = await apiClient.get<Order[]>('/orders/for-zones', { params: { zoneIds: zoneIds.join(',') } });
  return response.data;
}

export async function refundOrder(orderId: string): Promise<Order> {
  const response = await apiClient.post<Order>(`/orders/${orderId}/refund`);
  return response.data;
}
