import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core';
import { RecursosModule } from '@/modules/recursos/recursos.module';
import { ImportacaoController } from './importacao.controller';
import { ImportacaoService } from './importacao.service';
import { RecursosImportacao } from './cadastros/recursos.importacao';

@Module({
  imports: [PrismaModule, RecursosModule],
  controllers: [ImportacaoController],
  providers: [ImportacaoService, RecursosImportacao],
})
export class ImportacaoModule {}
