import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Menos que isto se adivinha: a rota fica fechada, como sem segredo */
export const TAMANHO_MINIMO_DO_TOKEN = 32;

/** A mesma recusa nos dois casos: a mensagem não conta a quem não tem o token se a integração está ligada */
const RECUSA = 'Token de integração inválido';

/**
 * Autentica o backend do NexON quando ele entrega um chamado.
 *
 * Segredo proprio (`NEXON_CHAMADOS_TOKEN`), e nao o `SINCRONIZACAO_TOKEN`: quem
 * so cria solicitacao nao deve conseguir gravar cadastro por cima, e trocar um
 * nao derruba o outro. Do lado do NexON o mesmo valor vai em
 * `SMART_SERVICE_TOKEN`.
 *
 * Mesmas regras do TokenServicoGuard: sem segredo configurado (ou com menos de
 * 32 caracteres) a rota fica fechada, e a comparacao e em tempo constante,
 * pelo hash dos dois lados (nem o tamanho do segredo vaza).
 */
@Injectable()
export class TokenNexonGuard implements CanActivate {
  private readonly logger = new Logger(TokenNexonGuard.name);

  private avisouSemSegredo = false;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const esperado = process.env.NEXON_CHAMADOS_TOKEN?.trim() ?? '';
    if (esperado.length < TAMANHO_MINIMO_DO_TOKEN) {
      this.avisarSemSegredo(esperado);
      throw new UnauthorizedException(RECUSA);
    }

    const cabecalho = req.headers['authorization'];
    const recebido = typeof cabecalho === 'string' ? cabecalho.replace(/^Bearer\s+/i, '') : '';
    if (!recebido || !TokenNexonGuard.igual(recebido, esperado)) {
      // O IP, nunca o cabeçalho: o 401 não passava por log nenhum
      this.logger.warn(`Chamado do NexON recusado: token inválido (ip ${req.ip})`);
      throw new UnauthorizedException(RECUSA);
    }
    return true;
  }

  /** Uma vez por processo: sem isso, cada pedido anônimo era uma linha de erro no log */
  private avisarSemSegredo(esperado: string) {
    if (this.avisouSemSegredo) return;
    this.avisouSemSegredo = true;
    this.logger.error(
      esperado
        ? `NEXON_CHAMADOS_TOKEN com menos de ${TAMANHO_MINIMO_DO_TOKEN} caracteres: chamados recusados`
        : 'NEXON_CHAMADOS_TOKEN nao configurado: chamados recusados',
    );
  }

  static igual(a: string, b: string): boolean {
    const hash = (texto: string) => createHash('sha256').update(texto).digest();
    return timingSafeEqual(hash(a), hash(b));
  }
}
