import { IsString } from 'class-validator';

export class ScanQrDto {
  @IsString()
  qrToken!: string;
}
