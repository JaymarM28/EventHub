import { Module } from '@nestjs/common';
import { ZonesConsumer } from './zones.consumer';
import { ZonesService } from './zones.service';

@Module({
  controllers: [ZonesConsumer],
  providers: [ZonesService],
})
export class ZonesModule {}
