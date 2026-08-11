import { Injectable } from '@nestjs/common';
import { PrismaService } from '@aupus/api-shared';

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

    const porItem = new Map<string, ItemHistorico>();

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
