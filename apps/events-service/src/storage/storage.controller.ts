import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '@event-hub/internal-auth';
import { StorageService } from './storage.service';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — de sobra para un plano/portada, evita subidas gigantes por error
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function assertIsImage(file?: Express.Multer.File): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('Falta el archivo (campo "file")');
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException('Solo se aceptan imágenes PNG, JPEG o WebP');
  }
}

/**
 * Dos endpoints separados (no uno genérico "/uploads") a propósito: cada
 * uno tiene su propio permiso — el mapa de un establecimiento es catálogo
 * de plataforma (SUPER_ADMIN, mismo criterio que VenuesController), una
 * imagen de evento la sube el organizador dueño de SU evento.
 */
@Controller('uploads')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('venue-map')
  @Roles('SUPER_ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE_BYTES } }))
  async uploadVenueMap(@UploadedFile() file?: Express.Multer.File) {
    assertIsImage(file);
    const url = await this.storage.uploadImage(file, 'venue-maps');
    return { url };
  }

  @Post('event-image')
  @Roles('ORGANIZER', 'SUPER_ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE_BYTES } }))
  async uploadEventImage(@UploadedFile() file?: Express.Multer.File) {
    assertIsImage(file);
    const url = await this.storage.uploadImage(file, 'event-images');
    return { url };
  }
}
