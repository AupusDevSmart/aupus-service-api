import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core';
import { SolicitacoesServicoModule } from '../solicitacoes-servico/solicitacoes-servico.module';
import { ChamadosNexonController } from './chamados-nexon.controller';
import { ChamadosNexonService } from './chamados-nexon.service';

/**
 * Entrada de chamados do NexON (NEXON-27). Modulo proprio, como a
 * sincronizacao: autenticacao de maquina nao divide controller com rota de usuario.
 */
@Module({
  imports: [PrismaModule, SolicitacoesServicoModule],
  controllers: [ChamadosNexonController],
  providers: [ChamadosNexonService],
})
export class IntegracoesNexonModule {}
