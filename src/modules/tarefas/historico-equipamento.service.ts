import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core';
import { calcularProximaExecucao, diasAteProxima } from './periodicidade';

/** A situacao de UMA tarefa do equipamento: o que ja rodou e quando roda de novo. */
export interface SituacaoDaTarefa {
  id: string;
  nome: string;
  frequencia: string | null;
  /** Execucao EFETIVA, lida das OS finalizadas — nao o campo cacheado. */
  ultima_execucao: Date | null;
  numero_execucoes: number;
  proxima_execucao: Date | null;
  /** Negativo quer dizer atrasada. Null quando a tarefa nao tem periodicidade. */
  dias_ate_proxima: number | null;
}

export interface HistoricoDoEquipamento {
  tarefas: SituacaoDaTarefa[];
  ordens: ItemHistorico[];
}

export interface TarefaDoHistorico {
  id: string;
  nome: string;
  status: string;
  data_conclusao: Date | null;
  concluida_por: string | null;
}

export interface ItemHistorico {
  tipo: 'OS' | 'PROGRAMACAO';
  id: string;
  numero: string;
  descricao: string;
  status: string;
  /**
   * De onde a OS nasceu: ANOMALIA, TAREFA, PLANO_MANUTENCAO,
   * SOLICITACAO_SERVICO ou MANUAL. A tela diferencia porque uma OS de anomalia
   * e trabalho corretivo — apareceu um problema —, enquanto as de tarefa e
   * plano sao preventivas, do calendario. Ambas contam como trabalho feito no
   * equipamento, por isso as duas aparecem.
   */
  origem: string;
  /** Data que situa o item na linha do tempo. Ver `dataDeReferencia`. */
  data: Date | null;
  tarefas_total: number;
  tarefas_concluidas: number;
  tarefas: TarefaDoHistorico[];
}

/**
 * Ordens de serviço e programações que tocaram um equipamento.
 *
 * A consulta é pelo `equipamento_id` congelado em `tarefas_os` e
 * `tarefas_programacao_os`, e NÃO por `ordens_servico.equipamento_id` (que em
 * produção quase nunca é preenchido) nem pelo join com a tarefa viva (que se
 * rompe quando o plano do equipamento é trocado e as cópias são apagadas).
 */
@Injectable()
export class HistoricoEquipamentoService {
  constructor(private prisma: PrismaService) {}

  /**
   * O que situa o item no tempo, na ordem em que a informação fica confiável:
   * o que de fato aconteceu, depois o que foi agendado, depois o previsto.
   */
  private dataDeReferencia(os: any): Date | null {
    return (
      os.data_hora_inicio_real ??
      os.data_hora_programada ??
      os.data_previsao_inicio ??
      os.criado_em ??
      null
    );
  }

  /**
   * Situacao de cada tarefa viva do equipamento.
   *
   * A ultima execucao vem das OS finalizadas, e nao de
   * `tarefas.data_ultima_execucao`: aquele campo e cache da finalizacao e pode
   * ficar defasado se algo falhar no caminho. E a proxima usa a
   * mesma funcao do agendador, para a tela nao dizer "atrasada" enquanto o cron
   * considera a tarefa em dia.
   */
  async situacaoDasTarefas(equipamentoId: string): Promise<SituacaoDaTarefa[]> {
    const id = equipamentoId?.trim();

    const tarefas = await this.prisma.tarefas.findMany({
      where: { equipamento_id: id, deleted_at: null },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    });

    if (tarefas.length === 0) return [];

    /**
     * As execuções vêm pelo `equipamento_id` congelado, e não por `tarefa_id`.
     *
     * Dois motivos, os dois reais neste banco: `tarefa_id` é `Char(26)` e o id
     * da tarefa tem 25 chars, então o `in` não casa; e o vínculo fica com
     * `tarefa_id` NULL quando a cópia do plano é apagada — mas a execução
     * aconteceu e precisa continuar contando.
     */
    const execucoes = await this.prisma.tarefas_os.findMany({
      where: {
        equipamento_id: id,
        status: 'CONCLUIDA',
        data_conclusao: { not: null },
        ordem_servico: { status: 'FINALIZADA', deletado_em: null },
      },
      select: { tarefa_id: true, nome_snapshot: true, data_conclusao: true },
    });

    const porId = new Map(tarefas.map((t) => [t.id.trim(), t.id.trim()]));
    // Nome congelado → tarefa viva. É como se atribui a execução de um vínculo
    // órfão, que perdeu o `tarefa_id` mas guardou o que foi pedido.
    const porNome = new Map(tarefas.map((t) => [t.nome, t.id.trim()]));

    const porTarefa = new Map<string, Date[]>();
    for (const e of execucoes) {
      if (!e.data_conclusao) continue;

      const chave =
        porId.get(e.tarefa_id?.trim() ?? '') ??
        (e.nome_snapshot ? porNome.get(e.nome_snapshot) : undefined);
      if (!chave) continue;

      if (!porTarefa.has(chave)) porTarefa.set(chave, []);
      porTarefa.get(chave)!.push(e.data_conclusao);
    }

    return tarefas.map((tarefa) => {
      const datas = porTarefa.get(tarefa.id.trim()) ?? [];
      const ultima = datas.length
        ? datas.reduce((maior, d) => (d > maior ? d : maior))
        : null;
      const proxima = calcularProximaExecucao(tarefa, ultima);

      return {
        id: tarefa.id.trim(),
        nome: tarefa.nome,
        frequencia: tarefa.frequencia ?? null,
        ultima_execucao: ultima,
        numero_execucoes: datas.length,
        proxima_execucao: proxima,
        dias_ate_proxima: diasAteProxima(proxima),
      };
    });
  }

  async listar(equipamentoId: string): Promise<ItemHistorico[]> {
    const id = equipamentoId?.trim();

    const [vinculosOS, vinculosProgramacao] = await Promise.all([
      this.prisma.tarefas_os.findMany({
        where: {
          equipamento_id: id,
          ordem_servico: { deletado_em: null },
        },
        include: {
          ordem_servico: {
            select: {
              id: true,
              numero_os: true,
              descricao: true,
              status: true,
              origem: true,
              criado_em: true,
              data_hora_inicio_real: true,
              data_hora_programada: true,
            },
          },
          // Ultimo recurso para linhas anteriores ao congelamento, que tem
          // nome_snapshot nulo. Pode vir null se a copia ja foi apagada.
          tarefa: { select: { nome: true } },
        },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      }),

      this.prisma.tarefas_programacao_os.findMany({
        where: {
          equipamento_id: id,
          programacao: {
            deletado_em: null,
            // Programação que já virou OS aparece como OS; mostrar as duas
            // seria contar o mesmo trabalho duas vezes na linha do tempo.
            ordem_servico: { is: null },
          },
        },
        include: {
          programacao: {
            select: {
              id: true,
              codigo: true,
              descricao: true,
              status: true,
              origem: true,
              criado_em: true,
              data_hora_programada: true,
              data_previsao_inicio: true,
            },
          },
          tarefa: { select: { nome: true } },
        },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      }),
    ]);

    /**
     * OS que apontam para o equipamento sem passar por tarefa.
     *
     * Uma OS de anomalia nasce do problema, não do calendário: ela não tem
     * `tarefas_os` nenhuma, e por isso não apareceria na consulta acima. O
     * caminho dela é `ordens_servico.equipamento_id`, que nesse caso É
     * preenchido — é o inverso das preventivas, onde esse campo quase nunca
     * está lá. As duas contam como trabalho feito no equipamento; o que a tela
     * separa é a origem.
     */
    const osDiretas = await this.prisma.ordens_servico.findMany({
      where: {
        equipamento_id: id,
        deletado_em: null,
        // As que vieram de tarefa já entraram pelo caminho do vínculo.
        tarefas_os: { none: {} },
      },
      select: {
        id: true,
        numero_os: true,
        descricao: true,
        status: true,
        origem: true,
        criado_em: true,
        data_hora_inicio_real: true,
        data_hora_programada: true,
      },
    });

    const porItem = new Map<string, ItemHistorico>();

    for (const os of osDiretas) {
      porItem.set(`OS:${os.id}`, {
        tipo: 'OS',
        id: os.id,
        numero: os.numero_os,
        descricao: os.descricao,
        status: os.status,
        origem: os.origem,
        data: this.dataDeReferencia(os),
        tarefas_total: 0,
        tarefas_concluidas: 0,
        tarefas: [],
      });
    }

    for (const vinculo of vinculosOS) {
      const os = vinculo.ordem_servico;
      const chave = `OS:${os.id}`;

      if (!porItem.has(chave)) {
        porItem.set(chave, {
          tipo: 'OS',
          id: os.id,
          numero: os.numero_os,
          descricao: os.descricao,
          status: os.status,
          origem: os.origem,
          data: this.dataDeReferencia(os),
          tarefas_total: 0,
          tarefas_concluidas: 0,
          tarefas: [],
        });
      }

      const item = porItem.get(chave)!;
      const concluida = vinculo.status === 'CONCLUIDA' || !!vinculo.data_conclusao;

      item.tarefas_total += 1;
      if (concluida) item.tarefas_concluidas += 1;
      item.tarefas.push({
        id: vinculo.id,
        // O snapshot é a fonte: a tarefa viva pode ter mudado de nome ou nem
        // existir mais, e o que interessa aqui é o que foi pedido na época.
        nome: vinculo.nome_snapshot || vinculo.instrucao_nome || vinculo.tarefa?.nome || 'Tarefa sem nome',
        status: vinculo.status,
        data_conclusao: vinculo.data_conclusao,
        concluida_por: vinculo.concluida_por,
      });
    }

    for (const vinculo of vinculosProgramacao) {
      const prog = vinculo.programacao;
      const chave = `PROG:${prog.id}`;

      if (!porItem.has(chave)) {
        porItem.set(chave, {
          tipo: 'PROGRAMACAO',
          id: prog.id,
          numero: prog.codigo,
          descricao: prog.descricao,
          status: prog.status,
          origem: prog.origem,
          data: this.dataDeReferencia(prog),
          tarefas_total: 0,
          tarefas_concluidas: 0,
          tarefas: [],
        });
      }

      const item = porItem.get(chave)!;
      item.tarefas_total += 1;
      item.tarefas.push({
        id: vinculo.id,
        nome: vinculo.nome_snapshot || vinculo.instrucao_nome || vinculo.tarefa?.nome || 'Tarefa sem nome',
        status: vinculo.status,
        data_conclusao: null,
        concluida_por: null,
      });
    }

    // Mais recente primeiro; sem data vai para o fim, e o id desempata para a
    // ordem não variar entre requisições.
    return [...porItem.values()].sort((a, b) => {
      const ta = a.data ? new Date(a.data).getTime() : -Infinity;
      const tb = b.data ? new Date(b.data).getTime() : -Infinity;
      if (tb !== ta) return tb - ta;
      return a.id.localeCompare(b.id);
    });
  }
}
