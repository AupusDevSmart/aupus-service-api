import { Module } from '@nestjs/common';
import { EquipamentosDadosController } from './equipamentos-dados.controller';
import { EquipamentosDadosService } from './equipamentos-dados.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EquipamentosDadosController],
  providers: [EquipamentosDadosService],
  exports: [EquipamentosDadosService],
})
export class EquipamentosDadosModule {}
