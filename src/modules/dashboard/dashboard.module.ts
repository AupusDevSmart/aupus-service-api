import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core';
import { DashboardController } from './dashboard.controller';
import { DashboardManutencaoService } from './dashboard-manutencao.service';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardManutencaoService],
  exports: [DashboardManutencaoService],
})
export class DashboardModule {}
