import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core';
import { RecursosModule } from '@/modules/recursos/recursos.module';
import { VeiculosModule } from '@/modules/veiculos/veiculos.module';
import { ImportacaoController } from './importacao.controller';
import { ImportacaoService } from './importacao.service';
import { RecursosImportacao } from './cadastros/recursos.importacao';
import { VeiculosImportacao } from './cadastros/veiculos.importacao';

@Module({
  imports: [PrismaModule, RecursosModule, VeiculosModule],
  controllers: [ImportacaoController],
  providers: [ImportacaoService, RecursosImportacao, VeiculosImportacao],
})
export class ImportacaoModule {}
