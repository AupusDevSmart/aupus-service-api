// src/modules/planos-manutencao/propagacao-planos.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@aupus/api-shared';

/** Campos que a propagacao pode escrever. Ver comentario em aplicarNaCopia. */
const CAMPOS_DE_DEFINICAO = [
  'nome',
  'instrucao_id',
  'frequencia',
  'frequencia_personalizada',
  'criticidade',
] as const;

export interface ResultadoPropagacao {
  copias_atualizadas: number;
  tarefas_atualizadas: number;
  tarefas_criadas: number;
  tarefas_removidas: number;
  tarefas_preservadas: number;
}

/**
 * Leva as alteracoes de um plano template para as copias dos equipamentos.
 *
 * A regra e uma so: **a propagacao mexe apenas em tarefas HERDADA**. Os outros
 * tres estados existem exatamente para dizer "aqui nao":
 *
 * - CUSTOMIZADA: foi ajustada naquele equipamento, sobrescrever apagaria o
 *   trabalho do usuario sem aviso
 * - REMOVIDA: foi tirada de proposito daquele equipamento; recriar faria o
 *   usuario remover de novo a cada edicao do template, para sempre
 * - PROPRIA: nasceu naquele equipamento, o template nunca a conheceu
 *
 * E escreve apenas os campos de definicao. `data_ultima_execucao`,
 * `numero_execucoes` e `data_ancora` sao estado de execucao daquele
 * equipamento: sobrescrever reprogramaria a base inteira de uma vez.
 */
@Injectable()
export class PropagacaoPlanosService {
  private readonly logger = new Logger(PropagacaoPlanosService.name);
  private processando = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enfileira e ja dispara o processamento, sem esperar por ele.
   *
   * O cron sozinho faria a propagacao demorar ate um ciclo inteiro para
   * comecar, e ficaria varrendo uma tabela vazia o tempo todo. Disparando
   * aqui, o caso normal comeca na hora e o cron passa a ser so a rede de
   * seguranca para o que ficou preso (processo reiniciado no meio, falha
   * transitoria).
   */
  async enfileirar(planoId: string): Promise<string> {
    const registro = await this.prisma.propagacoes_plano.create({
      data: { plano_id: planoId.trim() },
      select: { id: true },
    });

    // Sem await: quem salvou o template nao espera a propagacao terminar.
    void this.processarFila().catch((error) => {
      this.logger.warn(`Disparo imediato da propagacao falhou: ${error.message}`);
    });

    return registro.id;
  }

  async consultar(planoId: string) {
    return this.prisma.propagacoes_plano.findMany({
      where: { plano_id: planoId.trim() },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
  }

  // Rede de seguranca: o caminho normal e o disparo do enfileirar. Este cron
  // so pega o que sobrou de um processo reiniciado no meio ou de uma falha
  // transitoria, entao nao precisa ser frequente.
  @Cron('*/10 * * * *')
  async processarFila(): Promise<void> {
    // Guarda simples contra sobreposicao: o cron nao espera a rodada anterior.
    if (this.processando) return;
    this.processando = true;

    try {
      const pendentes = await this.prisma.propagacoes_plano.findMany({
        where: { status: 'PENDENTE' },
        orderBy: { created_at: 'asc' },
        take: 5,
      });

      for (const item of pendentes) {
        await this.processarItem(item.id, item.plano_id);
      }
    } catch (error) {
      this.logger.error(`Erro ao processar fila de propagacao: ${error.message}`, error.stack);
    } finally {
      this.processando = false;
    }
  }

  private async processarItem(propagacaoId: string, planoId: string): Promise<void> {
    await this.prisma.propagacoes_plano.update({
      where: { id: propagacaoId },
      data: { status: 'PROCESSANDO', iniciado_em: new Date() },
    });

    try {
      const resultado = await this.propagar(planoId);

      await this.prisma.propagacoes_plano.update({
        where: { id: propagacaoId },
        data: {
          status: 'CONCLUIDA',
          concluido_em: new Date(),
          ...resultado,
        },
      });

      this.logger.log(
        `Propagacao ${propagacaoId}: ${resultado.copias_atualizadas} equipamentos, ` +
          `${resultado.tarefas_atualizadas} atualizadas, ${resultado.tarefas_criadas} criadas, ` +
          `${resultado.tarefas_removidas} removidas, ${resultado.tarefas_preservadas} preservadas`,
      );
    } catch (error) {
      await this.prisma.propagacoes_plano.update({
        where: { id: propagacaoId },
        data: {
          status: 'FALHOU',
          concluido_em: new Date(),
          erro: String(error?.message || error).slice(0, 1000),
        },
      });

      this.logger.error(`Propagacao ${propagacaoId} falhou: ${error.message}`);
    }
  }

  async propagar(planoId: string): Promise<ResultadoPropagacao> {
    const template = await this.prisma.planos_manutencao.findFirst({
      where: { id: planoId.trim(), deleted_at: null, plano_origem_id: null },
      include: {
        tarefas: { where: { deleted_at: null }, orderBy: { ordem: 'asc' } },
        copias: {
          where: { deleted_at: null },
          include: { tarefas: { where: { deleted_at: null } } },
        },
      },
    });

    if (!template) {
      throw new Error('Plano template não encontrado');
    }

    const resultado: ResultadoPropagacao = {
      copias_atualizadas: 0,
      tarefas_atualizadas: 0,
      tarefas_criadas: 0,
      tarefas_removidas: 0,
      tarefas_preservadas: 0,
    };

    for (const copia of template.copias) {
      const parcial = await this.aplicarNaCopia(template, copia);

      if (parcial.tarefas_atualizadas || parcial.tarefas_criadas || parcial.tarefas_removidas) {
        resultado.copias_atualizadas++;
      }

      resultado.tarefas_atualizadas += parcial.tarefas_atualizadas;
      resultado.tarefas_criadas += parcial.tarefas_criadas;
      resultado.tarefas_removidas += parcial.tarefas_removidas;
      resultado.tarefas_preservadas += parcial.tarefas_preservadas;
    }

    return resultado;
  }

  private async aplicarNaCopia(template: any, copia: any) {
    const parcial = {
      tarefas_atualizadas: 0,
      tarefas_criadas: 0,
      tarefas_removidas: 0,
      tarefas_preservadas: 0,
    };

    const porOrigem = new Map<string, any>();
    for (const tarefa of copia.tarefas) {
      const origemId = tarefa.tarefa_origem_id?.trim();
      if (origemId) porOrigem.set(origemId, tarefa);
    }

    // Cabecalho do plano acompanha o template
    await this.prisma.planos_manutencao.update({
      where: { id: copia.id },
      data: { nome: template.nome, descricao: template.descricao, versao: template.versao },
    });

    for (const tarefaTemplate of template.tarefas) {
      const naCopia = porOrigem.get(tarefaTemplate.id.trim());

      if (!naCopia) {
        // Tarefa nova no template entra em todas as copias que ainda nao a tem.
        // Se ela ja existiu e foi removida localmente, o registro REMOVIDA
        // continua ali (soft delete) e cai no ramo de baixo.
        const jaRemovida = await this.prisma.tarefas.findFirst({
          where: {
            plano_manutencao_id: copia.id,
            tarefa_origem_id: tarefaTemplate.id.trim(),
            origem_status: 'REMOVIDA',
          },
          select: { id: true },
        });

        if (jaRemovida) {
          parcial.tarefas_preservadas++;
          continue;
        }

        await this.prisma.tarefas.create({
          data: {
            plano_manutencao_id: copia.id,
            equipamento_id: copia.equipamento_id,
            planta_id: copia.tarefas[0]?.planta_id ?? null,
            tarefa_origem_id: tarefaTemplate.id,
            origem_status: 'HERDADA',
            data_ancora: new Date(),
            tag: await this.gerarTag(copia.equipamento_id),
            nome: tarefaTemplate.nome,
            instrucao_id: tarefaTemplate.instrucao_id,
            frequencia: tarefaTemplate.frequencia,
            frequencia_personalizada: tarefaTemplate.frequencia_personalizada,
            criticidade: tarefaTemplate.criticidade,
            ordem: tarefaTemplate.ordem,
            ativo: true,
            // Colunas herdadas enquanto o drop nao acontece
            descricao: tarefaTemplate.descricao,
            categoria: tarefaTemplate.categoria,
            tipo_manutencao: tarefaTemplate.tipo_manutencao,
            condicao_ativo: tarefaTemplate.condicao_ativo,
            duracao_estimada: tarefaTemplate.duracao_estimada,
            tempo_estimado: tarefaTemplate.tempo_estimado,
          },
        });
        parcial.tarefas_criadas++;
        continue;
      }

      if (naCopia.origem_status !== 'HERDADA') {
        parcial.tarefas_preservadas++;
        continue;
      }

      const dados: Record<string, unknown> = {};
      for (const campo of CAMPOS_DE_DEFINICAO) {
        if (naCopia[campo] !== tarefaTemplate[campo]) {
          dados[campo] = tarefaTemplate[campo];
        }
      }

      if (Object.keys(dados).length === 0) continue;

      await this.prisma.tarefas.update({
        where: { id: naCopia.id },
        data: {
          ...dados,
          // Conteudo herdado acompanha a instrucao nova, se ela mudou
          ...(dados.instrucao_id
            ? {
                descricao: tarefaTemplate.descricao,
                categoria: tarefaTemplate.categoria,
                tipo_manutencao: tarefaTemplate.tipo_manutencao,
                condicao_ativo: tarefaTemplate.condicao_ativo,
                duracao_estimada: tarefaTemplate.duracao_estimada,
                tempo_estimado: tarefaTemplate.tempo_estimado,
              }
            : {}),
          updated_at: new Date(),
        },
      });
      parcial.tarefas_atualizadas++;
    }

    // Tarefa apagada do template sai das copias, exceto onde foi customizada:
    // ali o usuario assumiu a tarefa como dele.
    const idsNoTemplate = new Set(template.tarefas.map((t: any) => t.id.trim()));
    for (const tarefa of copia.tarefas) {
      const origemId = tarefa.tarefa_origem_id?.trim();
      if (!origemId || idsNoTemplate.has(origemId)) continue;

      if (tarefa.origem_status !== 'HERDADA') {
        parcial.tarefas_preservadas++;
        continue;
      }

      await this.prisma.tarefas.update({
        where: { id: tarefa.id },
        data: { deleted_at: new Date() },
      });
      parcial.tarefas_removidas++;
    }

    return parcial;
  }

  private async gerarTag(equipamentoId: string | null): Promise<string> {
    const total = await this.prisma.tarefas.count({
      where: { equipamento_id: equipamentoId ?? undefined },
    });

    return `TRF-${String(total + 1).padStart(4, '0')}-${Date.now().toString(36).toUpperCase()}`;
  }
}
