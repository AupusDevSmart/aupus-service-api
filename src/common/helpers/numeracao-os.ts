import type { Prisma } from '@prisma/client';

/**
 * O numero da OS: PREFIXO-ANO-0000, com serie PROPRIA por prefixo.
 *
 * Vive aqui, e nao dentro de um service, porque DOIS caminhos criam OS:
 * `ExecucaoOSService.iniciar` e `ProgramacaoOSService` ao gerar a OS a partir da
 * OP. Enquanto cada um tinha a sua regra, so um recebeu o formato novo — o outro
 * seguiu emitindo `OS-2026-004` em producao, que foi como o defeito apareceu.
 *
 * A contagem e por prefixo e por ano: OSP-2026-0021 e OSS-2026-0014 convivem sem
 * relacao entre si. Uma serie global faria os numeros de um mesmo tipo saltarem
 * conforme os outros fossem criados, e o salto nao significaria nada.
 *
 * O formato antigo, `OS-ANO-000`, fica como esta e e ignorado pela contagem:
 * renumerar mexeria em OS que ja pode ter sido impressa.
 */

export function prefixoPorOrigem(origem?: string): string {
  switch (origem) {
    case 'PLANO_MANUTENCAO':
    case 'TAREFA':
      return 'OSP';
    case 'SOLICITACAO_SERVICO':
      return 'OSS';
    case 'ANOMALIA':
      return 'OSE';
    default:
      // MANUAL e qualquer origem futura. Nao fica sem prefixo: numero sem
      // prefixo quebraria a leitura da coluna e a busca por "OS".
      return 'OSM';
  }
}

/**
 * `prisma` aceita tanto o client quanto o handle de uma transacao — os dois
 * caminhos chamam de dentro de `$transaction`.
 *
 * Le o MAIOR numero da serie em vez de contar as linhas: contar erra depois de
 * qualquer exclusao (some uma OS, o proximo numero repete um que ja existiu). O
 * maior e numerico, nao alfabetico: como texto, "OSP-2026-10000" viria antes de
 * "OSP-2026-9999". A trava da transacao impede duas OS simultaneas de lerem o
 * mesmo numero (antes a segunda caia no indice unico).
 */
export async function gerarNumeroOS(prisma: Prisma.TransactionClient, origem?: string): Promise<string> {
  const ano = new Date().getFullYear();
  const prefixo = `${prefixoPorOrigem(origem)}-${ano}-`;

  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`numero-os:${prefixo}`}))`;
  const [maior] = await prisma.$queryRaw<{ ultimo: number | null }[]>`
    SELECT max(substring(numero_os from ${`^${prefixo}([0-9]+)$`})::int) AS ultimo FROM ordens_servico`;
  const sequencial = (maior?.ultimo ?? 0) + 1;

  return `${prefixo}${String(sequencial).padStart(4, '0')}`;
}
