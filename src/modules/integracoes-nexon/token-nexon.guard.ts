import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

/**
 * Autentica o backend do NexON quando ele entrega um chamado.
 *
 * Segredo proprio (`NEXON_CHAMADOS_TOKEN`), e nao o `SINCRONIZACAO_TOKEN`: quem
 * so cria solicitacao nao deve conseguir gravar cadastro por cima, e trocar um
 * nao derruba o outro. Do lado do NexON o mesmo valor vai em
 * `SMART_SERVICE_TOKEN`.
 *
 * Mesmas regras do TokenServicoGuard: sem segredo configurado a rota fica
 * fechada, e a comparacao e em tempo constante.
 */
@Injectable()
export class TokenNexonGuard implements CanActivate {
  private readonly logger = new Logger(TokenNexonGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const esperado = process.env.NEXON_CHAMADOS_TOKEN;
    if (!esperado) {
      this.logger.error('NEXON_CHAMADOS_TOKEN nao configurado: chamado recusado');
      throw new UnauthorizedException('Integração com o NexON não configurada neste servidor');
    }

    const req = context.switchToHttp().getRequest();
    const cabecalho = req.headers['authorization'];
    const recebido = typeof cabecalho === 'string' ? cabecalho.replace(/^Bearer\s+/i, '') : '';

    if (!recebido || !TokenNexonGuard.igual(recebido, esperado)) {
      throw new UnauthorizedException('Token de integração inválido');
    }
    return true;
  }

  static igual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}
