import { Module } from '@nestjs/common';
import { ConcessionariasModule, PrismaModule, UsuariosModule } from '@/core';
import { RecursosModule } from '@/modules/recursos/recursos.module';
import { VeiculosModule } from '@/modules/veiculos/veiculos.module';
import { AgendaModule } from '@/modules/agenda/agenda.module';
import { ImportacaoController } from './importacao.controller';
import { ImportacaoService } from './importacao.service';
import { RecursosImportacao } from './cadastros/recursos.importacao';
import { VeiculosImportacao } from './cadastros/veiculos.importacao';
import { FeriadosImportacao } from './cadastros/feriados.importacao';
import { ConcessionariasImportacao } from './cadastros/concessionarias.importacao';
import { UsuariosImportacao } from './cadastros/usuarios.importacao';

@Module({
  imports: [PrismaModule, RecursosModule, VeiculosModule, AgendaModule, ConcessionariasModule, UsuariosModule],
  controllers: [ImportacaoController],
  providers: [ImportacaoService, RecursosImportacao, VeiculosImportacao, FeriadosImportacao, ConcessionariasImportacao, UsuariosImportacao],
})
export class ImportacaoModule {}
