import { Module, forwardRef } from '@nestjs/common';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { SolicitacoesServicoController } from './solicitacoes-servico.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { ProgramacaoOSModule } from '../programacao-os/programacao-os.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ProgramacaoOSModule), // Para evitar dependência circular
  ],
  controllers: [SolicitacoesServicoController],
  providers: [SolicitacoesServicoService],
  exports: [SolicitacoesServicoService], // Exportar para ser usado em outros módulos
})
export class SolicitacoesServicoModule {}