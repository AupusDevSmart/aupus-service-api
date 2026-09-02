import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AtivosFuncionaisController } from './ativos-funcionais.controller';
import { AtivosFuncionaisService } from './ativos-funcionais.service';

@Module({
  imports: [PrismaModule],
  controllers: [AtivosFuncionaisController],
  providers: [AtivosFuncionaisService],
  exports: [AtivosFuncionaisService],
})
export class AtivosFuncionaisModule {}
