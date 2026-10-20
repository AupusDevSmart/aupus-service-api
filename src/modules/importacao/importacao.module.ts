import { Module } from '@nestjs/common';
import { ConcessionariasModule, EquipamentosModule, PlantasModule, PrismaModule, UnidadesModule, UsuariosModule } from '@/core';
import { RecursosModule } from '@/modules/recursos/recursos.module';
import { MaquinariosModule } from '@/modules/maquinarios/maquinarios.module';
import { VeiculosModule } from '@/modules/veiculos/veiculos.module';
import { AgendaModule } from '@/modules/agenda/agenda.module';
import { InstrucoesModule } from '@/modules/instrucoes/instrucoes.module';
import { PlanosManutencaoModule } from '@/modules/planos-manutencao/planos-manutencao.module';
import { TarefasModule } from '@/modules/tarefas/tarefas.module';
import { ImportacaoController } from './importacao.controller';
import { ImportacaoService } from './importacao.service';
import { RecursosImportacao } from './cadastros/recursos.importacao';
import { MaquinariosImportacao } from './cadastros/maquinarios.importacao';
import { VeiculosImportacao } from './cadastros/veiculos.importacao';
import { FeriadosImportacao } from './cadastros/feriados.importacao';
import { ConcessionariasImportacao } from './cadastros/concessionarias.importacao';
import { UsuariosImportacao } from './cadastros/usuarios.importacao';
import { InstrucoesImportacao } from './cadastros/instrucoes.importacao';
import { PlanosImportacao } from './cadastros/planos.importacao';
import { PlantasImportacao } from './cadastros/plantas.importacao';
import { EquipamentosImportacao } from './cadastros/equipamentos.importacao';

@Module({
  imports: [PrismaModule, RecursosModule, MaquinariosModule, VeiculosModule, AgendaModule, ConcessionariasModule, UsuariosModule, InstrucoesModule, PlanosManutencaoModule, TarefasModule, PlantasModule, UnidadesModule, EquipamentosModule],
  controllers: [ImportacaoController],
  providers: [ImportacaoService, RecursosImportacao, MaquinariosImportacao, VeiculosImportacao, FeriadosImportacao, ConcessionariasImportacao, UsuariosImportacao, InstrucoesImportacao, PlanosImportacao, PlantasImportacao, EquipamentosImportacao],
})
export class ImportacaoModule {}
