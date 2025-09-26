import { Module } from '@nestjs/common';
import { VeiculosController } from './veiculos.controller';
import { VeiculosService } from './veiculos.service';
import { DocumentacaoVeiculosService } from './documentacao-veiculos.service';
import { DocumentacaoVeiculosController, DocumentacaoVeiculosGlobalController } from './documentacao-veiculos.controller';

@Module({
  controllers: [VeiculosController, DocumentacaoVeiculosController, DocumentacaoVeiculosGlobalController],
  providers: [VeiculosService, DocumentacaoVeiculosService],
  exports: [VeiculosService, DocumentacaoVeiculosService],
})
export class VeiculosModule {}