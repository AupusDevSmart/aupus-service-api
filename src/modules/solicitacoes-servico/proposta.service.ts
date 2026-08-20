// src/modules/solicitacoes-servico/proposta.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@aupus/api-shared';
import { Prisma } from '@prisma/client';

/**
 * A proposta comercial de uma solicitação de serviço.
 *
 * Os itens são CÓPIA dos recursos da instrução, não referência. Uma proposta é
 * um documento: se apontasse para o catálogo por id, reajustar o preço de um
 * recurso amanhã reescreveria retroativamente uma proposta já enviada ao
 * cliente, e o PDF gerado hoje sairia diferente do gerado no mês que vem.
 *
 * É o mesmo padrão que a OS usa ao congelar tag, nome e descrição da tarefa em
 * `tarefas_os`.
 */
@Injectable()
export class PropostaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Decimal do Prisma para número, sem passar por string solta. */
  private num(valor: Prisma.Decimal | number | null | undefined): number {
    if (valor === null || valor === undefined) return 0;
    const n = typeof valor === 'object' ? valor.toNumber() : Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  /** Centavos. Somar float sem arredondar acumula erro e o total não fecha. */
  private centavos(valor: number): number {
    return Math.round(valor * 100) / 100;
  }

  // ============================================================
  // CÓPIA
  // ============================================================

  /**
   * Materializa itens e etapas a partir das instruções vinculadas.
   *
   * Chamado quando as instruções da solicitação mudam. Refaz a lista inteira,
   * e por isso **descarta edições de preço** dos itens que vieram de instrução
   * — quem mexe nas instruções está redefinindo o escopo da proposta.
   *
   * Os itens avulsos (sem `instrucao_id`), adicionados à mão na proposta,
   * sobrevivem: eles não pertencem a instrução nenhuma.
   */
  async materializarDeInstrucoes(solicitacaoId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;

    const vinculos = await db.solicitacoes_instrucoes.findMany({
      where: { solicitacao_id: solicitacaoId },
      orderBy: { ordem: 'asc' },
      select: { instrucao_id: true },
    });

    const instrucaoIds = vinculos.map((v) => v.instrucao_id.trim());

    await db.solicitacoes_itens.deleteMany({
      where: { solicitacao_id: solicitacaoId, instrucao_id: { not: null } },
    });
    await db.solicitacoes_subinstrucoes.deleteMany({
      where: { solicitacao_id: solicitacaoId },
    });

    if (instrucaoIds.length === 0) {
      await this.recalcular(solicitacaoId, db);
      return;
    }

    const [recursos, subinstrucoes] = await Promise.all([
      db.recursos_instrucao.findMany({
        where: { instrucao_id: { in: instrucaoIds } },
        include: { recurso: true },
        orderBy: [{ tipo: 'asc' }, { descricao: 'asc' }],
      }),
      db.sub_instrucoes.findMany({
        where: { instrucao_id: { in: instrucaoIds } },
        orderBy: { ordem: 'asc' },
      }),
    ]);

    if (recursos.length > 0) {
      await db.solicitacoes_itens.createMany({
        data: recursos.map((r, indice) => {
          // O preço vem do catálogo AGORA e congela aqui. `recurso` pode ser
          // nulo nas linhas antigas, digitadas antes de o catálogo existir.
          const preco = this.num(r.recurso?.preco_medio);
          return {
            solicitacao_id: solicitacaoId,
            instrucao_id: r.instrucao_id,
            recurso_id: r.recurso_id,
            descricao: r.descricao,
            unidade: r.unidade,
            quantidade: this.num(r.quantidade) || 1,
            preco_unitario_original: preco,
            preco_unitario: preco,
            ordem: indice + 1,
          };
        }),
      });
    }

    if (subinstrucoes.length > 0) {
      await db.solicitacoes_subinstrucoes.createMany({
        data: subinstrucoes.map((s, indice) => ({
          solicitacao_id: solicitacaoId,
          instrucao_id: s.instrucao_id,
          descricao: s.descricao,
          tempo_estimado: s.tempo_estimado,
          ordem: s.ordem ?? indice + 1,
        })),
      });
    }

    await this.recalcular(solicitacaoId, db);
  }

  // ============================================================
  // CÁLCULO
  // ============================================================

  /**
   * Recalcula e GRAVA os totais.
   *
   * Gravar, e não calcular na leitura, porque a tela, a listagem e o PDF
   * precisam do mesmo número — e daqui a seis meses, mesmo que o catálogo e a
   * alíquota tenham mudado.
   *
   * A fórmula acordada é margem, alíquota por dentro e faturamento direto fora
   * do imposto:
   *
   *   tributavel  = custo dos itens + outros custos que NÃO são FD
   *   com_imposto = tributavel / (1 - aliquota)     <- por dentro
   *   total_geral = (com_imposto + custos FD) * (1 + lucro)
   *
   * O FD fica fora do imposto porque o cliente paga o fornecedor direto: o
   * dinheiro não passa pela empresa, então não há o que tributar. Ele volta
   * para a conta depois, e recebe margem como o resto.
   */
  async recalcular(solicitacaoId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;

    const [solicitacao, itens, outros] = await Promise.all([
      db.solicitacoes_servico.findFirst({
        where: { id: solicitacaoId },
        select: { id: true, lucro_percentual: true, com_nota_fiscal: true, aliquota_percentual: true },
      }),
      db.solicitacoes_itens.findMany({
        where: { solicitacao_id: solicitacaoId },
        select: { quantidade: true, preco_unitario: true },
      }),
      db.solicitacoes_outros_custos.findMany({
        where: { solicitacao_id: solicitacaoId },
        select: { valor: true, faturamento_direto: true },
      }),
    ]);

    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');

    const custoItens = itens.reduce(
      (soma, i) => soma + this.num(i.quantidade) * this.num(i.preco_unitario),
      0,
    );

    const custoFD = outros
      .filter((o) => o.faturamento_direto)
      .reduce((soma, o) => soma + this.num(o.valor), 0);

    const custoComum = outros
      .filter((o) => !o.faturamento_direto)
      .reduce((soma, o) => soma + this.num(o.valor), 0);

    const totalCusto = this.centavos(custoItens + custoComum + custoFD);
    const tributavel = custoItens + custoComum;

    const aliquota = solicitacao.com_nota_fiscal
      ? this.num(solicitacao.aliquota_percentual) / 100
      : 0;

    // Guarda contra alíquota de 100%, que faria uma divisão por zero.
    const comImposto = aliquota > 0 && aliquota < 1 ? tributavel / (1 - aliquota) : tributavel;
    const totalImposto = this.centavos(comImposto - tributavel);

    const lucro = this.num(solicitacao.lucro_percentual) / 100;
    const baseDoLucro = comImposto + custoFD;
    const totalLucro = this.centavos(baseDoLucro * lucro);
    const totalGeral = this.centavos(baseDoLucro + totalLucro);

    await db.solicitacoes_servico.update({
      where: { id: solicitacaoId },
      data: {
        total_custo: totalCusto,
        total_imposto: totalImposto,
        total_lucro: totalLucro,
        total_geral: totalGeral,
      },
    });

    return { totalCusto, totalImposto, totalLucro, totalGeral, custoFD };
  }

  // ============================================================
  // LEITURA
  // ============================================================

  async obter(solicitacaoId: string) {
    const [itens, subinstrucoes, outros, solicitacao] = await Promise.all([
      this.prisma.solicitacoes_itens.findMany({
        where: { solicitacao_id: solicitacaoId },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.solicitacoes_subinstrucoes.findMany({
        where: { solicitacao_id: solicitacaoId },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.solicitacoes_outros_custos.findMany({
        where: { solicitacao_id: solicitacaoId },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.solicitacoes_servico.findFirst({
        where: { id: solicitacaoId },
        select: {
          lucro_percentual: true,
          com_nota_fiscal: true,
          aliquota_percentual: true,
          total_custo: true,
          total_imposto: true,
          total_lucro: true,
          total_geral: true,
        },
      }),
    ]);

    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');

    return {
      itens,
      subinstrucoes,
      outros_custos: outros,
      lucro_percentual: this.num(solicitacao.lucro_percentual),
      com_nota_fiscal: solicitacao.com_nota_fiscal,
      aliquota_percentual: this.num(solicitacao.aliquota_percentual),
      total_custo: this.num(solicitacao.total_custo),
      total_imposto: this.num(solicitacao.total_imposto),
      total_lucro: this.num(solicitacao.total_lucro),
      total_geral: this.num(solicitacao.total_geral),
    };
  }

  // ============================================================
  // ESCRITA
  // ============================================================

  /** Substitui a lista inteira de itens. O front manda o estado final. */
  async salvarItens(
    solicitacaoId: string,
    itens: Array<{
      descricao: string;
      unidade?: string | null;
      quantidade: number;
      preco_unitario: number;
      preco_unitario_original?: number | null;
      instrucao_id?: string | null;
      recurso_id?: string | null;
    }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.solicitacoes_itens.deleteMany({ where: { solicitacao_id: solicitacaoId } });

      if (itens.length > 0) {
        await tx.solicitacoes_itens.createMany({
          data: itens.map((i, indice) => ({
            solicitacao_id: solicitacaoId,
            instrucao_id: i.instrucao_id ?? null,
            recurso_id: i.recurso_id ?? null,
            descricao: i.descricao,
            unidade: i.unidade ?? null,
            quantidade: i.quantidade,
            preco_unitario: i.preco_unitario,
            preco_unitario_original: i.preco_unitario_original ?? null,
            ordem: indice + 1,
          })),
        });
      }

      await this.recalcular(solicitacaoId, tx);
    });

    return this.obter(solicitacaoId);
  }

  async salvarOutrosCustos(
    solicitacaoId: string,
    custos: Array<{ descricao: string; valor: number; faturamento_direto?: boolean }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.solicitacoes_outros_custos.deleteMany({
        where: { solicitacao_id: solicitacaoId },
      });

      if (custos.length > 0) {
        await tx.solicitacoes_outros_custos.createMany({
          data: custos.map((c, indice) => ({
            solicitacao_id: solicitacaoId,
            descricao: c.descricao,
            valor: c.valor,
            faturamento_direto: c.faturamento_direto ?? false,
            ordem: indice + 1,
          })),
        });
      }

      await this.recalcular(solicitacaoId, tx);
    });

    return this.obter(solicitacaoId);
  }

  /** Lucro, nota fiscal e alíquota. Recalcula em seguida. */
  async salvarCondicoes(
    solicitacaoId: string,
    dados: { lucro_percentual?: number; com_nota_fiscal?: boolean; aliquota_percentual?: number },
  ) {
    await this.prisma.solicitacoes_servico.update({
      where: { id: solicitacaoId },
      data: {
        ...(dados.lucro_percentual !== undefined && { lucro_percentual: dados.lucro_percentual }),
        ...(dados.com_nota_fiscal !== undefined && { com_nota_fiscal: dados.com_nota_fiscal }),
        ...(dados.aliquota_percentual !== undefined && {
          aliquota_percentual: dados.aliquota_percentual,
        }),
      },
    });

    await this.recalcular(solicitacaoId);
    return this.obter(solicitacaoId);
  }
}
