import { Module } from '@nestjs/common';
import { ConcessionariasModule, PlantasModule, PrismaModule, UnidadesModule, UsuariosModule } from '@/core';
import { RecursosModule } from '@/modules/recursos/recursos.module';
import { VeiculosModule } from '@/modules/veiculos/veiculos.module';
import { AgendaModule } from '@/modules/agenda/agenda.module';
import { InstrucoesModule } from '@/modules/instrucoes/instrucoes.module';
import { PlanosManutencaoModule } from '@/modules/planos-manutencao/planos-manutencao.module';
import { TarefasModule } from '@/modules/tarefas/tarefas.module';
import { ImportacaoController } from './importacao.controller';
import { ImportacaoService } from './importacao.service';
import { RecursosImportacao } from './cadastros/recursos.importacao';
import { VeiculosImportacao } from './cadastros/veiculos.importacao';
import { FeriadosImportacao } from './cadastros/feriados.importacao';
import { ConcessionariasImportacao } from './cadastros/concessionarias.importacao';
import { UsuariosImportacao } from './cadastros/usuarios.importacao';
import { InstrucoesImportacao } from './cadastros/instrucoes.importacao';
import { PlanosImportacao } from './cadastros/planos.importacao';
import { PlantasImportacao } from './cadastros/plantas.importacao';

@Module({
  imports: [PrismaModule, RecursosModule, VeiculosModule, AgendaModule, ConcessionariasModule, UsuariosModule, InstrucoesModule, PlanosManutencaoModule, TarefasModule, PlantasModule, UnidadesModule],
  controllers: [ImportacaoController],
  providers: [ImportacaoService, RecursosImportacao, VeiculosImportacao, FeriadosImportacao, ConcessionariasImportacao, UsuariosImportacao, InstrucoesImportacao, PlanosImportacao, PlantasImportacao],
})
export class ImportacaoModule {}
