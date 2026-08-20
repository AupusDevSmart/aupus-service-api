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

  /** Os nove componentes, em fração (5,00% vira 0,05). */
  private componentesBdi(s: {
    bdi_administracao_central?: Prisma.Decimal | null;
    bdi_seguro_garantia?: Prisma.Decimal | null;
    bdi_taxa_risco?: Prisma.Decimal | null;
    bdi_despesas_financeiras?: Prisma.Decimal | null;
    bdi_lucro?: Prisma.Decimal | null;
    bdi_pis?: Prisma.Decimal | null;
    bdi_cofins?: Prisma.Decimal | null;
    bdi_cprb?: Prisma.Decimal | null;
    bdi_issqn?: Prisma.Decimal | null;
  }) {
    const f = (v: Prisma.Decimal | null | undefined) => this.num(v) / 100;
    return {
      ac: f(s.bdi_administracao_central),
      sg: f(s.bdi_seguro_garantia),
      r: f(s.bdi_taxa_risco),
      df: f(s.bdi_despesas_financeiras),
      l: f(s.bdi_lucro),
      i: f(s.bdi_pis) + f(s.bdi_cofins) + f(s.bdi_cprb) + f(s.bdi_issqn),
    };
  }

  /**
   * O BDI, pela fórmula do acórdão 2.622/2013 do TCU.
   *
   *   BDI = [ (1+AC+SG+R) × (1+DF) × (1+L) / (1-I) ] - 1
   *
   * Com a tabela GOINFRA sem REIDI (AC 5, SG 0,5, R 0, DF 0,5, L 5, I 14,65)
   * o resultado é 0,3044 — os 30,44% da planilha de referência.
   */
  private calcularBdi(componentes: ReturnType<typeof this.componentesBdi>): number {
    const { ac, sg, r, df, l, i } = componentes;

    // Guarda contra I >= 100%, que faria a divisão explodir. Não é cenário
    // real, mas o campo é editável e um dígito a mais derrubaria a conta.
    if (i >= 1) return 0;

    return ((1 + ac + sg + r) * (1 + df) * (1 + l)) / (1 - i) - 1;
  }

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
        select: {
          id: true,
          bdi_administracao_central: true,
          bdi_seguro_garantia: true,
          bdi_taxa_risco: true,
          bdi_despesas_financeiras: true,
          bdi_lucro: true,
          bdi_pis: true,
          bdi_cofins: true,
          bdi_cprb: true,
          bdi_issqn: true,
        },
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

    // O faturamento direto NÃO recebe BDI.
    //
    // É dinheiro que o cliente paga direto ao fornecedor: não passa pela
    // empresa, então não tem administração central, não tem imposto e não tem
    // lucro. Entra no total como repasse puro.
    const baseDoBdi = custoItens + custoComum;

    const bdi = this.calcularBdi(this.componentesBdi(solicitacao));
    const totalBdi = this.centavos(baseDoBdi * bdi);
    const totalGeral = this.centavos(baseDoBdi + totalBdi + custoFD);

    await db.solicitacoes_servico.update({
      where: { id: solicitacaoId },
      data: {
        total_custo: totalCusto,
        total_bdi: totalBdi,
        // Três casas: 30,44% arredondado para 30,4% já move o total de uma
        // proposta grande em dezenas de reais.
        bdi_percentual: Math.round(bdi * 100 * 1000) / 1000,
        total_geral: totalGeral,
      },
    });

    return { totalCusto, totalBdi, totalGeral, custoFD, bdi };
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
          bdi_regime: true,
          bdi_administracao_central: true,
          bdi_seguro_garantia: true,
          bdi_taxa_risco: true,
          bdi_despesas_financeiras: true,
          bdi_lucro: true,
          bdi_pis: true,
          bdi_cofins: true,
          bdi_cprb: true,
          bdi_issqn: true,
          bdi_percentual: true,
          total_custo: true,
          total_bdi: true,
          total_geral: true,
        },
      }),
    ]);

    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');

    return {
      itens,
      subinstrucoes,
      outros_custos: outros,
      bdi_regime: solicitacao.bdi_regime,
      bdi_administracao_central: this.num(solicitacao.bdi_administracao_central),
      bdi_seguro_garantia: this.num(solicitacao.bdi_seguro_garantia),
      bdi_taxa_risco: this.num(solicitacao.bdi_taxa_risco),
      bdi_despesas_financeiras: this.num(solicitacao.bdi_despesas_financeiras),
      bdi_lucro: this.num(solicitacao.bdi_lucro),
      bdi_pis: this.num(solicitacao.bdi_pis),
      bdi_cofins: this.num(solicitacao.bdi_cofins),
      bdi_cprb: this.num(solicitacao.bdi_cprb),
      bdi_issqn: this.num(solicitacao.bdi_issqn),
      bdi_percentual: this.num(solicitacao.bdi_percentual),
      total_custo: this.num(solicitacao.total_custo),
      total_bdi: this.num(solicitacao.total_bdi),
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

  /**
   * Substitui as etapas. Elas sao copia da instrucao, e editar aqui ajusta o
   * escopo DESTA proposta sem tocar na instrucao original.
   *
   * Nao entram no calculo: o preco vem dos itens. O tempo aqui serve ao
   * descritivo do servico no PDF.
   */
  async salvarSubinstrucoes(
    solicitacaoId: string,
    subinstrucoes: Array<{ descricao: string; tempo_estimado?: number | null }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.solicitacoes_subinstrucoes.deleteMany({
        where: { solicitacao_id: solicitacaoId },
      });

      if (subinstrucoes.length > 0) {
        await tx.solicitacoes_subinstrucoes.createMany({
          data: subinstrucoes.map((s, indice) => ({
            solicitacao_id: solicitacaoId,
            descricao: s.descricao,
            tempo_estimado: s.tempo_estimado ?? null,
            ordem: indice + 1,
          })),
        });
      }
    });

    return this.obter(solicitacaoId);
  }

  /**
   * Os componentes do BDI. Recalcula em seguida.
   *
   * O REIDI (Regime Especial de Incentivos para o Desenvolvimento da
   * Infraestrutura) desonera PIS e COFINS. Trocar o regime zera os dois — ou
   * os devolve ao padrão —, e a pessoa ainda pode ajustar cada um depois.
   */
  async salvarCondicoes(
    solicitacaoId: string,
    dados: Record<string, number | string | undefined>,
  ) {
    const numericos = [
      'bdi_administracao_central',
      'bdi_seguro_garantia',
      'bdi_taxa_risco',
      'bdi_despesas_financeiras',
      'bdi_lucro',
      'bdi_pis',
      'bdi_cofins',
      'bdi_cprb',
      'bdi_issqn',
    ] as const;

    const data: Record<string, number | string> = {};

    for (const campo of numericos) {
      const valor = dados[campo];
      if (valor !== undefined && valor !== null && valor !== '') {
        data[campo] = Number(valor);
      }
    }

    if (dados.bdi_regime === 'COM_REIDI' || dados.bdi_regime === 'SEM_REIDI') {
      data.bdi_regime = dados.bdi_regime;

      // Só mexe em PIS e COFINS se o próprio pedido não os trouxe: quem manda
      // regime E percentual está dizendo exatamente o que quer.
      if (data.bdi_pis === undefined) data.bdi_pis = dados.bdi_regime === 'COM_REIDI' ? 0 : 0.65;
      if (data.bdi_cofins === undefined) data.bdi_cofins = dados.bdi_regime === 'COM_REIDI' ? 0 : 3.0;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.solicitacoes_servico.update({ where: { id: solicitacaoId }, data });
    }

    await this.recalcular(solicitacaoId);
    return this.obter(solicitacaoId);
  }
}
