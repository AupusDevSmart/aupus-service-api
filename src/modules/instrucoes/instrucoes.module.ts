// src/modules/instrucoes/instrucoes.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { InstrucoesController } from './instrucoes.controller';
import { InstrucoesService } from './instrucoes.service';
import { AnexosInstrucoesService } from './anexos-instrucoes.service';
import { PrismaModule } from '@/core';
import { PlanosManutencaoModule } from '../planos-manutencao/planos-manutencao.module';

@Module({
  // Adicionar instrucao a um template gera tarefa, que precisa propagar
  imports: [PrismaModule, forwardRef(() => PlanosManutencaoModule)],
  controllers: [InstrucoesController],
  providers: [InstrucoesService, AnexosInstrucoesService],
  exports: [InstrucoesService],
})
export class InstrucoesModule {}
