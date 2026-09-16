import { Body, Controller, Post } from '@nestjs/common';
import {
  InternalHeaders,
  InternalUser,
  InternalUserContext,
  RawInternalHeaders,
} from '@event-hub/internal-auth';
import { ScansService } from './scans.service';
import { ScanQrDto } from './dto/scan-qr.dto';

@Controller('access')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post('scan')
  scan(
    @Body() dto: ScanQrDto,
    @InternalUser() user: InternalUserContext,
    @InternalHeaders() headers: RawInternalHeaders,
  ) {
    return this.scansService.scan(dto.qrToken, user, headers);
  }
}
