// ===============================
// src/modules/ferramentas/ferramentas.module.ts
// ===============================
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { FerramentasController } from './controllers/ferramentas.controller';
import { CalibracaoController } from './controllers/calibracao.controller';
import { ManutencaoController } from './controllers/manutencao.controller';
import { FerramentasService } from './services/ferramentas.service';
import { CalibracaoService } from './services/calibracao.service';
import { ManutencaoService } from './services/manutencao.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    FerramentasController,
    CalibracaoController,
    ManutencaoController,
  ],
  providers: [
    FerramentasService,
    CalibracaoService,
    ManutencaoService,
  ],
  exports: [
    FerramentasService,
    CalibracaoService,
    ManutencaoService,
  ],
})
export class FerramentasModule {}