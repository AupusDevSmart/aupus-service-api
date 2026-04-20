import { Module } from '@nestjs/common';
import { PrismaModule } from '@aupus/api-shared';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardSimpleService } from './dashboard-simple.service';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardSimpleService],
  exports: [DashboardService, DashboardSimpleService],
})
export class DashboardModule {}
