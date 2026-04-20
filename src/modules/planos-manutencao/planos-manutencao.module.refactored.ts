// src/modules/planos-manutencao/planos-manutencao.module.ts - REFATORADO
import { Module } from '@nestjs/common';
import { PlanosManutencaoController } from './planos-manutencao.controller';
import { PlanosManutencaoService } from './planos-manutencao.service';
import { PrismaModule } from '@aupus/api-shared';

// Services especializados
import { PlanosManutencaoCrudService } from './services/planos-manutencao-crud.service';
import { PlanosManutencaoQueryService } from './services/planos-manutencao-query.service';
import { PlanosManutencaoDuplicacaoService } from './services/planos-manutencao-duplicacao.service';
import { PlanosManutencaoEstatisticasService } from './services/planos-manutencao-estatisticas.service';
import { PlanosManutencaoMapper } from './services/planos-manutencao.mapper';

@Module({
  imports: [PrismaModule],
  controllers: [PlanosManutencaoController],
  providers: [
    // Service principal (Facade)
    PlanosManutencaoService,

    // Services especializados
    PlanosManutencaoCrudService,
    PlanosManutencaoQueryService,
    PlanosManutencaoDuplicacaoService,
    PlanosManutencaoEstatisticasService,

    // Mapper
    PlanosManutencaoMapper
  ],
  exports: [PlanosManutencaoService],
})
export class PlanosManutencaoModule {}
