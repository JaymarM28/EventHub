import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

/**
 * Sube archivos a Cloudflare R2 (compatible con la API de S3 — mismo SDK,
 * solo cambia el endpoint, ver DESIGN.md #41). Elegido sobre AWS S3 por el
 * usuario: sin costo de egreso, más barato para un catálogo de imágenes
 * que se descarga seguido (mapas de venue, portadas de evento).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucket = '';
  private publicBaseUrl = '';

  /**
   * Resuelto perezosamente (no en el constructor) a propósito: R2 es
   * opcional hasta que el usuario cree el bucket y pegue las credenciales
   * en .env (ver .env.example) — si esto fuera `getOrThrow` en el
   * constructor, events-service completo no arrancaría mientras tanto.
   * Con esto, arranca igual y solo esta ruta puntual falla si falta
   * configurar R2.
   */
  constructor(private readonly config: ConfigService) {}

  private getClient(): S3Client {
    if (this.client) return this.client;
    this.bucket = this.config.getOrThrow<string>('R2_BUCKET');
    this.publicBaseUrl = this.config.getOrThrow<string>('R2_PUBLIC_BASE_URL').replace(/\/$/, '');
    this.client = new S3Client({
      region: 'auto',
      endpoint: this.config.getOrThrow<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
    return this.client;
  }

  /**
   * Nombre de archivo generado (uuid + extensión original) a propósito —
   * nunca el nombre que subió el usuario, evita colisiones y path
   * traversal (ver Section 3, Security & Threat Model del CEO review de
   * esta misma feature).
   */
  async uploadImage(file: Express.Multer.File, folder: 'venue-maps' | 'event-images'): Promise<string> {
    const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${folder}/${randomUUID()}.${ext}`;
    const client = this.getClient();

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const url = `${this.publicBaseUrl}/${key}`;
    this.logger.log(`Imagen subida: ${key}`);
    return url;
  }
}
