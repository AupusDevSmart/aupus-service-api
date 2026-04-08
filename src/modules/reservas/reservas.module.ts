import { Module } from '@nestjs/common';
import { ReservasController } from './reservas.controller';
import { ReservasService } from './reservas.service';
import { ReservasSchedulerService } from './reservas-scheduler.service';
import { VeiculosModule } from '../veiculos/veiculos.module';

@Module({
  imports: [VeiculosModule],
  controllers: [ReservasController],
  providers: [ReservasService, ReservasSchedulerService],
  exports: [ReservasService],
})
export class ReservasModule {}