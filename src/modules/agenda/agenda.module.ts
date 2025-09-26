import { Module } from '@nestjs/common';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { FeriadosService } from './feriados.service';
import { ConfiguracoesDiasUteisService } from './configuracoes-dias-uteis.service';

@Module({
  controllers: [AgendaController],
  providers: [AgendaService, FeriadosService, ConfiguracoesDiasUteisService],
  exports: [AgendaService, FeriadosService, ConfiguracoesDiasUteisService],
})
export class AgendaModule {}