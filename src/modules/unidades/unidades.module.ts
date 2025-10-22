import { Module } from '@nestjs/common';
import { UnidadesController } from './unidades.controller';
import { UnidadesService } from './unidades.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { EquipamentosModule } from '../equipamentos/equipamentos.module';
import { DiagramasModule } from '../diagramas/diagramas.module';

@Module({
  imports: [PrismaModule, EquipamentosModule, DiagramasModule],
  controllers: [UnidadesController],
  providers: [UnidadesService],
  exports: [UnidadesService],
})
export class UnidadesModule {}
