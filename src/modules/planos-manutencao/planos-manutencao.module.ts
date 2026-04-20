// src/modules/planos-manutencao/planos-manutencao.module.ts
import { Module } from '@nestjs/common';
import { PlanosManutencaoController } from './planos-manutencao.controller';
import { PlanosManutencaoService } from './planos-manutencao.service';
import { PrismaModule } from '@aupus/api-shared';

@Module({
  imports: [PrismaModule],
  controllers: [PlanosManutencaoController],
  providers: [PlanosManutencaoService],
  exports: [PlanosManutencaoService],
})
export class PlanosManutencaoModule {}