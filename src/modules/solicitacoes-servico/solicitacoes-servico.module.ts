import { Module, forwardRef } from '@nestjs/common';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';
import { SolicitacoesServicoController } from './solicitacoes-servico.controller';
import { PrismaModule } from '@/core';
import { ProgramacaoOSModule } from '../programacao-os/programacao-os.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ProgramacaoOSModule), // Para evitar dependência circular
  ],
  controllers: [SolicitacoesServicoController],
  providers: [SolicitacoesServicoService, PropostaService],
  exports: [SolicitacoesServicoService, PropostaService],
})
export class SolicitacoesServicoModule {}