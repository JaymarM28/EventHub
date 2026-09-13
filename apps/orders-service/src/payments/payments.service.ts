import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PaymentResult {
  success: boolean;
}

/**
 * Pago simulado (Open Question de DESIGN.md, resuelta): se simula primero
 * para no bloquear el aprendizaje del flujo de eventos en configuración de
 * una pasarela real. `PAYMENT_SIMULATED_FAILURE_RATE` permite forzar fallos
 * en pruebas para ejercitar el camino de liberación de reserva.
 */
@Injectable()
export class PaymentsService {
  private readonly failureRate: number;

  constructor(config: ConfigService) {
    // ConfigService.get<T>() no convierte tipos en runtime, solo castea a
    // nivel de TypeScript — un valor de .env siempre llega como string.
    this.failureRate = Number(config.get('PAYMENT_SIMULATED_FAILURE_RATE', '0'));
  }

  async charge(_amount: number): Promise<PaymentResult> {
    await new Promise((resolve) => setTimeout(resolve, 100)); // simula latencia de red
    const success = Math.random() >= this.failureRate;
    return { success };
  }
}
