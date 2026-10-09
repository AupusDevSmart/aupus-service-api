import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Uma transação aberta por quem precisa que os services do formulário gravem
 * DENTRO dela — hoje, a importação de planilha (`modules/importacao`).
 *
 * A prévia da importação roda o caminho inteiro do formulário e desfaz no fim.
 * Os services, porém, usam o `PrismaService` injetado e alguns abrem o próprio
 * `$transaction`: passados um a um, gravariam fora da transação da prévia e o
 * "desfazer" não desfaria nada. Em vez de fazer cada service receber um `tx`,
 * o `PrismaService` consulta este contexto e, enquanto ele existe, desvia para
 * a transação aberta (ver `prisma.service.ts`).
 *
 * O contexto é por cadeia assíncrona (AsyncLocalStorage): só o que nasce
 * dentro de `rodar()` o enxerga. As outras requisições, ao mesmo tempo, seguem
 * com o banco de sempre.
 *
 * O que sai do banco — fila de propagação de planos, e-mail, evento de MQTT —
 * não pode acontecer com dado que ainda vai ser desfeito: passa por
 * `depoisDeGravar`, que espera quem abriu a transação confirmar.
 */
export class TransacaoEmCurso {
  private static readonly armazenamento = new AsyncLocalStorage<TransacaoEmCurso>();
  private static readonly logger = new Logger('TransacaoEmCurso');

  private readonly pendentes: Array<() => unknown> = [];

  constructor(readonly tx: Prisma.TransactionClient) {}

  static atual(): TransacaoEmCurso | undefined {
    return TransacaoEmCurso.armazenamento.getStore();
  }

  /** Roda `fn` sem o contexto — o que não deve entrar na transação. */
  static fora<T>(fn: () => T): T {
    return TransacaoEmCurso.armazenamento.exit(fn);
  }

  rodar<T>(fn: () => Promise<T>): Promise<T> {
    return TransacaoEmCurso.armazenamento.run(this, fn);
  }

  registrarPendente(efeito: () => unknown) {
    this.pendentes.push(efeito);
  }

  /** Onde a fila de pendentes está agora — para descartar o que vier depois. */
  marca(): number {
    return this.pendentes.length;
  }

  /** O registro foi desfeito: os efeitos dele não podem mais acontecer. */
  descartarDesde(marca: number) {
    this.pendentes.length = marca;
  }

  /**
   * Depois do commit. Um efeito que falha não derruba os outros: o dado já
   * está gravado, e o que falhou fica no log (a fila de propagação, por
   * exemplo, tem o cron como rede de segurança).
   */
  async executarPendentes() {
    const efeitos = this.pendentes.splice(0);
    await TransacaoEmCurso.fora(async () => {
      for (const efeito of efeitos) {
        try {
          await efeito();
        } catch (erro) {
          TransacaoEmCurso.logger.error(
            `Efeito depois da gravação falhou: ${erro instanceof Error ? erro.message : String(erro)}`,
          );
        }
      }
    });
  }
}

/**
 * Um efeito fora do banco. Sem transação em curso, roda na hora — o
 * comportamento de sempre; dentro de uma, fica pendente até ela confirmar, e
 * some se ela for desfeita.
 */
export function depoisDeGravar(efeito: () => unknown): void {
  const emCurso = TransacaoEmCurso.atual();
  if (emCurso) {
    emCurso.registrarPendente(efeito);
    return;
  }
  void efeito();
}
