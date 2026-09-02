import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardSimpleService } from './dashboard-simple.service';
import { DashboardManutencaoService } from './dashboard-manutencao.service';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardSimpleService, DashboardManutencaoService],
  exports: [DashboardService, DashboardSimpleService, DashboardManutencaoService],
})
export class DashboardModule {}
