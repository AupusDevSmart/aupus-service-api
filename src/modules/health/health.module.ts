import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AlertService } from './alert.service';
import { PrismaModule } from '@/core';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthService, AlertService],
  exports: [HealthService, AlertService],
})
export class HealthModule {}
