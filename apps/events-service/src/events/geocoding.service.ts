import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface GeocodedPoint {
  latitude: number;
  longitude: number;
  address: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Fase C (#18): geocoding de "venue, city" a lat/lng vía la API pública de
 * Nominatim (OpenStreetMap) — se eligió a propósito por sobre Google
 * Geocoding API para no repetir el problema de Stripe/Mercado Pago (cuenta
 * de facturación, tarjeta de crédito) solo para mostrar un mapa. Sin API
 * key, gratis, pero con política de uso que exige un User-Agent
 * identificable y como mucho ~1 request/segundo — aceptable acá porque
 * geocodificar solo pasa al crear/editar un evento, no en cada lectura.
 *
 * Best-effort SIEMPRE: cualquier fallo (red, sin resultados, rate limit)
 * devuelve `null` en vez de lanzar — un evento sin coordenadas simplemente
 * no muestra el mapa (ver EventsService.create/update), nunca bloquea la
 * operación por esto.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly http: HttpService) {}

  async geocode(venue: string, city: string): Promise<GeocodedPoint | null> {
    const query = `${venue}, ${city}`;
    try {
      const response = await firstValueFrom(
        this.http.get<NominatimResult[]>('https://nominatim.openstreetmap.org/search', {
          params: { q: query, format: 'json', limit: 1 },
          headers: { 'User-Agent': 'EventHub/1.0 (proyecto de aprendizaje, contacto: jaymarmurillo10@gmail.com)' },
          timeout: 5000,
        }),
      );
      const first = response.data[0];
      if (!first) return null;
      return { latitude: parseFloat(first.lat), longitude: parseFloat(first.lon), address: first.display_name };
    } catch (err) {
      this.logger.warn(`No se pudo geocodificar "${query}": ${(err as Error).message}`);
      return null;
    }
  }
}
