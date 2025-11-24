import { Module } from '@nestjs/common';
import { EquipamentosDadosController } from './equipamentos-dados.controller';
import { EquipamentosDadosService } from './equipamentos-dados.service';
import { ClassificacaoHorariosService } from './services/classificacao-horarios.service';
import { CalculoCustosService } from './services/calculo-custos.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EquipamentosDadosController],
  providers: [
    EquipamentosDadosService,
    ClassificacaoHorariosService,
    CalculoCustosService,
  ],
  exports: [EquipamentosDadosService],
})
export class EquipamentosDadosModule {}
