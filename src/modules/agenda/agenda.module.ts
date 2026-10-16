import { Module } from '@nestjs/common';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { FeriadosService } from './feriados.service';
import { ConfiguracoesDiasUteisService } from './configuracoes-dias-uteis.service';
import { PrevisaoDaAgendaController } from './previsao/previsao-da-agenda.controller';
import { PrevisaoDaAgendaService } from './previsao/previsao-da-agenda.service';

@Module({
  controllers: [AgendaController, PrevisaoDaAgendaController],
  providers: [AgendaService, FeriadosService, ConfiguracoesDiasUteisService, PrevisaoDaAgendaService],
  exports: [AgendaService, FeriadosService, ConfiguracoesDiasUteisService],
})
export class AgendaModule {}