import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como accesible sin contexto interno (sin login) dentro
 * de un servicio que por defecto exige autenticación. Útil para listados de
 * solo lectura (ej. navegar eventos sin estar logueado).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
