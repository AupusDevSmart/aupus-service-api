import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core';
import { RecursosModule } from '@/modules/recursos/recursos.module';
import { VeiculosModule } from '@/modules/veiculos/veiculos.module';
import { AgendaModule } from '@/modules/agenda/agenda.module';
import { ImportacaoController } from './importacao.controller';
import { ImportacaoService } from './importacao.service';
import { RecursosImportacao } from './cadastros/recursos.importacao';
import { VeiculosImportacao } from './cadastros/veiculos.importacao';
import { FeriadosImportacao } from './cadastros/feriados.importacao';

@Module({
  imports: [PrismaModule, RecursosModule, VeiculosModule, AgendaModule],
  controllers: [ImportacaoController],
  providers: [ImportacaoService, RecursosImportacao, VeiculosImportacao, FeriadosImportacao],
})
export class ImportacaoModule {}
