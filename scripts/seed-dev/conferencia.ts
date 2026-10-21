import type { Cenario } from './cenario';

export interface ConferenciaDoSeed {
  /** O maior id do outbox antes do apagar: qualquer evento acima dele é do seed */
  ultimoDoOutbox: bigint;
  /** Anexos de OS finalizada sem soma (o código de verificação não provaria a foto) */
  anexosSemSoma: string[];
}

/**
 * O que o cenário tem de cumprir antes de gravar. Quebrar uma regra do
 * combinado derruba o seed (nada fica); faltar um status para alguma tela
 * mostrar só avisa, porque depende do dia da semana em que roda.
 *
 * As filas que os services tocam sem lançar erro (a propagação dos planos, o
 * processador de notificações) e as listas que o planejador monta são
 * conferidas aqui: um defeito nesses caminhos só imprimiria uma linha de log.
 */
export async function conferirCenario(c: Cenario, dados: ConferenciaDoSeed): Promise<string[]> {
  const { prisma } = c;
  const avisos: string[] = [];
  const erros: string[] = [];
  const contarSql = async (sql: string) => Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql))[0].n);

  // Os avisos pendentes viram notificação; o e-mail deles nunca sai do dev
  while ((await c.s.notificacoes.processarPendentes()) > 0) {
    /* processa até a fila de eventos esvaziar */
  }
  const desligados = await prisma.notificacoes_envios.updateMany({
    where: { status: 'pendente' },
    data: { status: 'desligado', erro: 'seed do dev: e-mail não enviado' },
  });
  c.log(`  e-mails da fila desligados: ${desligados.count}`);
  // O cron das 4h15 apaga o registro da fila com mais de 90 dias (a notificação fica): uma vez, com a data de hoje, dá o mesmo
  const limpos = await c.s.limpezaDeNotificacoes.limpar(c.agora);
  c.log(`  limpeza da fila de notificações (mais de 90 dias): ${limpos.eventos} eventos e ${limpos.envios} e-mails`);

  // Nada para o NexOn
  const outboxNovos = await prisma.sincronizacao_outbox.count({ where: { id: { gt: dados.ultimoDoOutbox } } });
  if (outboxNovos > 0) erros.push(`O outbox do NexOn ganhou ${outboxNovos} eventos: nada pode ir ao NexOn`);
  const vinculosNovos = await prisma.sincronizacao_vinculos.count({ where: { recurso: { in: ['plantas', 'unidades', 'equipamentos'] } } });
  if (vinculosNovos > 0) erros.push(`${vinculosNovos} vínculos de sincronização de planta, instalação ou equipamento: o seed não vincula ao NexOn`);

  // As filas que falham caladas
  const propagacoes = await prisma.propagacoes_plano.groupBy({ by: ['status'], where: { status: { in: ['PENDENTE', 'PROCESSANDO', 'FALHOU'] } }, _count: true });
  if (propagacoes.length > 0) erros.push(`Propagação de plano sem terminar: ${propagacoes.map((p) => `${p.status} ${p._count}`).join(', ')}`);
  const eventosComErro = await prisma.notificacoes_eventos.count({ where: { erro: { not: null } } });
  if (eventosComErro > 0) erros.push(`${eventosComErro} eventos de notificação com erro no processador`);

  // As regras do roadmap
  const manuais = await prisma.programacoes_os.count({ where: { origem: 'MANUAL' } });
  if (manuais > 0) erros.push(`${manuais} programações com origem MANUAL (SN-69)`);
  const semPlanta = (await prisma.programacoes_os.count({ where: { planta_id: null } })) + (await prisma.ordens_servico.count({ where: { planta_id: null } }));
  if (semPlanta > 0) erros.push(`${semPlanta} programações ou OS sem planta (SN-35)`);

  // ≥ 90% das UC em uso com plano: o equipamento distinto, não o número de planos
  const ucs = await contarSql(`SELECT count(*) AS n FROM equipamentos WHERE classificacao = 'UC' AND deleted_at IS NULL AND ativo_na_posicao`);
  const comPlano = await contarSql(
    `SELECT count(DISTINCT trim(e.id)) AS n FROM equipamentos e
       JOIN planos_manutencao p ON trim(p.equipamento_id) = trim(e.id) AND p.deleted_at IS NULL
      WHERE e.classificacao = 'UC' AND e.deleted_at IS NULL AND e.ativo_na_posicao`,
  );
  if (comPlano < ucs * 0.9) erros.push(`Só ${comPlano} de ${ucs} UC com plano; o combinado é 90%`);

  // OS completas (decisão do usuário): equipe e material planejados pelas instruções
  const osSemTecnico = await contarSql(
    `SELECT count(*) AS n FROM ordens_servico o WHERE o.deletado_em IS NULL
        AND NOT EXISTS (SELECT 1 FROM tecnicos_os t WHERE trim(t.os_id) = trim(o.id))`,
  );
  if (osSemTecnico > 0) erros.push(`${osSemTecnico} OS sem técnico planejado`);
  const materiais = await prisma.materiais_os.count();
  if (materiais === 0) erros.push('Nenhuma OS com material: o planejador não leu os recursos das instruções');
  const finalizadasSemMaterial = await contarSql(
    `SELECT count(*) AS n FROM ordens_servico o WHERE o.status = 'FINALIZADA' AND o.deletado_em IS NULL
        AND NOT EXISTS (SELECT 1 FROM materiais_os m WHERE trim(m.os_id) = trim(o.id))`,
  );
  if (finalizadasSemMaterial > 0) avisos.push(`${finalizadasSemMaterial} OS finalizadas sem material (instruções só de inspeção)`);

  // O PDF de toda OS finalizada confere: o código foi regravado com as datas da história
  if (dados.anexosSemSoma.length > 0) erros.push(`Anexos sem soma em OS finalizada: ${dados.anexosSemSoma.slice(0, 5).join('; ')}`);
  const finalizadas = await prisma.ordens_servico.findMany({ where: { status: 'FINALIZADA' }, select: { codigo_verificacao: true, numero_os: true } });
  for (const os of finalizadas) {
    if (!os.codigo_verificacao) {
      erros.push(`OS ${os.numero_os} finalizada sem código de verificação`);
      continue;
    }
    const conferencia = await c.s.execucoes.conferirCodigo(os.codigo_verificacao.trim());
    if (!conferencia.confere) erros.push(`O código da OS ${os.numero_os} não confere: ${conferencia.diferencas.join('; ')}`);
  }
  c.log(`  códigos de verificação conferidos: ${finalizadas.length}`);

  const restos = await c.relogio.restos();
  if (restos.length > 0) avisos.push(`Carimbos que ficaram na data real (fora de um passo do relógio): ${restos.join(', ')}`);

  const contarPor = async (tabela: 'ordens_servico' | 'programacoes_os' | 'anomalias' | 'solicitacoes_servico', esperados: string[]) => {
    const linhas = await prisma.$queryRawUnsafe<{ status: string; n: bigint }[]>(`SELECT status::text AS status, count(*) AS n FROM "${tabela}" GROUP BY 1`);
    const mapa = new Map(linhas.map((l) => [l.status, Number(l.n)]));
    const faltam = esperados.filter((s) => !mapa.get(s));
    if (faltam.length > 0) avisos.push(`${tabela} sem ${faltam.join(', ')} (depende do dia em que o seed roda)`);
    c.log(`  ${tabela}: ${[...mapa].map(([s, n]) => `${s} ${n}`).join(', ')}`);
  };
  await contarPor('ordens_servico', ['PENDENTE', 'EM_EXECUCAO', 'PAUSADA', 'EXECUTADA', 'AUDITADA', 'FINALIZADA', 'CANCELADA']);
  await contarPor('programacoes_os', ['PENDENTE', 'APROVADA', 'CANCELADA', 'FINALIZADA']);
  await contarPor('anomalias', ['REGISTRADA', 'PROGRAMADA', 'FINALIZADA']);
  await contarPor('solicitacoes_servico', ['REGISTRADA', 'PROGRAMADA', 'FINALIZADA']);

  const corretivasComParada = await prisma.ordens_servico.count({ where: { tipo: 'CORRETIVA', equipamento_parou: true, status: 'FINALIZADA' } });
  if (corretivasComParada < 5) avisos.push(`Só ${corretivasComParada} corretivas finalizadas com parada: o MTBF e o MTTR ficam ralos`);

  if (erros.length > 0) throw new Error(`O cenário não cumpre o combinado:\n  - ${erros.join('\n  - ')}`);
  return avisos;
}
