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
 * Le o ULTIMO numero da serie em vez de contar as linhas. Contar erra depois de
 * qualquer exclusao: some uma OS, o proximo numero repete um que ja existiu.
 * A ordenacao alfabetica serve porque o padding deixa todos do mesmo tamanho.
 */
export async function gerarNumeroOS(prisma: any, origem?: string): Promise<string> {
  const ano = new Date().getFullYear();
  const prefixo = `${prefixoPorOrigem(origem)}-${ano}-`;

  const ultima = await prisma.ordens_servico.findFirst({
    where: { numero_os: { startsWith: prefixo } },
    orderBy: { numero_os: 'desc' },
    select: { numero_os: true },
  });

  let sequencial = 1;
  if (ultima?.numero_os) {
    const lido = parseInt(ultima.numero_os.slice(prefixo.length), 10);
    if (Number.isFinite(lido)) sequencial = lido + 1;
  }

  return `${prefixo}${String(sequencial).padStart(4, '0')}`;
}
