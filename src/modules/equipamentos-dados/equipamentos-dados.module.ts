import { Module } from '@nestjs/common';
import { EquipamentosDadosController } from './equipamentos-dados.controller';
import { EquipamentosDadosService } from './equipamentos-dados.service';
import { ClassificacaoHorariosService } from './services/classificacao-horarios.service';
import { CalculoCustosService } from './services/calculo-custos.service';
import { FeriadosNacionaisService } from './services/feriados-nacionais.service';
import { MqttIngestionService } from './services/mqtt-ingestion.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EquipamentosDadosController],
  providers: [
    EquipamentosDadosService,
    ClassificacaoHorariosService,
    CalculoCustosService,
    FeriadosNacionaisService,
    MqttIngestionService, // ✅ NOVO
  ],
  exports: [
    EquipamentosDadosService,
    MqttIngestionService,
    CalculoCustosService,
    ClassificacaoHorariosService,
  ], // ✅ Exportar para uso em outros módulos
})
export class EquipamentosDadosModule {}
