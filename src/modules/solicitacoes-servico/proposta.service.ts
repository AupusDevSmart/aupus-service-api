// src/modules/solicitacoes-servico/proposta.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core';
import { Prisma } from '@prisma/client';
import { valoresDasInstrucoes } from '../instrucoes/valor-da-instrucao';
import type { CondicoesDaPropostaDto } from './dto/proposta.dto';

/**
 * A proposta comercial de uma solicitação de serviço.
 *
 * Uma linha por instrução vinculada, com o valor FECHADO daquela instrução.
 * Nada da instrução é copiado item a item: o que a proposta guarda é o preço,
 * não a composição.
 *
 * O valor NASCE da soma dos recursos do catálogo, como sugestão, e congela ali.
 * Ele é cópia, e não referência, porque uma proposta é um documento: se
 * apontasse para o catálogo por id, reajustar o preço de um recurso amanhã
 * reescreveria retroativamente uma proposta já enviada ao cliente, e o PDF
 * gerado hoje sairia diferente do gerado no mês que vem.
 *
 * É o mesmo padrão que a OS usa ao congelar tag, nome e descrição da tarefa em
 * `tarefas_os`.
 *
 * O escopo (as etapas) NÃO é copiado: o PDF lê as sub-instruções ao vivo na
 * hora de gerar. Escopo é descrição do serviço, não preço — e quem corrige uma
 * instrução quer a correção valendo.
 */
/** Os tetos das colunas dos totais: `bdi_percentual` Decimal(6, 3) e os totais Decimal(14, 2) */
const TETO_DO_BDI = 999.999;
const TETO_DO_TOTAL = 999_999_999_999.99;

@Injectable()
export class PropostaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Decimal do Prisma para número, sem passar por string solta. */
  private num(valor: Prisma.Decimal | number | null | undefined): number {
    if (valor === null || valor === undefined) return 0;
    const n = typeof valor === 'object' ? valor.toNumber() : Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Trava a solicitação para escrever a proposta (SN-94), dentro da transação da escrita:
   * - a que não existe é 404 (a lista de itens numa que não existe dava erro de chave
   *   estrangeira, 500; o BDI, registro não encontrado no update);
   * - só a REGISTRADA se edita (409), como o PATCH da solicitação e a tela, que só abre a
   *   edição nela: a programada tem a proposta que o cliente aceitou;
   * - o FOR UPDATE enfileira duas gravações da mesma proposta. Sem ele, as duas apagavam a
   *   lista antiga, cada uma inseria a sua, e a proposta saía com as linhas em dobro.
   */
  private async travarParaEditar(tx: Prisma.TransactionClient, solicitacaoId: string): Promise<void> {
    const [solicitacao] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM solicitacoes_servico
       WHERE id = ${solicitacaoId} AND deleted_at IS NULL
       FOR UPDATE`;
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');
    if (solicitacao.status !== 'REGISTRADA') {
      throw new ConflictException('A proposta só se edita com a solicitação registrada: depois de programada, é a que o cliente aceitou.');
    }
  }

  /** Centavos. Somar float sem arredondar acumula erro e o total não fecha. */
  private centavos(valor: number): number {
    return Math.round(valor * 100) / 100;
  }

  // ============================================================
  // CÓPIA
  // ============================================================

  /**
   * Refaz a lista: uma linha por instrução vinculada, valendo a soma dos
   * recursos daquela instrução no catálogo.
   *
   * **Descarta os valores editados.** Quem manda recarregar está redefinindo o
   * escopo — é a mesma decisão de antes, só que agora a unidade descartada é o
   * valor fechado da instrução, e não o preço de cada recurso.
   *
   * Para preservar o que já foi ajustado, o caminho é `salvarItens`: o front
   * manda o estado final e decide o que mantém.
   */
  async materializarDeInstrucoes(solicitacaoId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;

    const vinculos = await db.solicitacoes_instrucoes.findMany({
      where: { solicitacao_id: solicitacaoId },
      orderBy: { ordem: 'asc' },
      select: { instrucao_id: true },
    });

    const instrucaoIds = vinculos.map((v) => v.instrucao_id.trim());

    // Limpa TUDO que veio de instrução — inclusive as linhas por recurso do
    // formato antigo, que ficariam soltas na tela sem instrução a que pertencer.
    await db.solicitacoes_itens.deleteMany({ where: { solicitacao_id: solicitacaoId } });

    if (instrucaoIds.length === 0) {
      await this.recalcular(solicitacaoId, db);
      return;
    }

    // O custo da instrução (a conta do AupusProject, SN-85), que vira a sugestão
    // de valor. A linha sem preço entra como zero: é sugestão, e a pessoa ajusta —
    // a leitura da proposta diz quais instruções têm linha assim (`instrucoes_sem_preco`)
    const [instrucoes, valores] = await Promise.all([
      db.instrucoes.findMany({
        where: { id: { in: instrucaoIds } },
        select: { id: true, codigo: true, nome: true },
      }),
      valoresDasInstrucoes(db, instrucaoIds),
    ]);

    const porId = new Map(instrucoes.map((i) => [i.id.trim(), i]));

    // A ordem segue a dos vínculos, não a do findMany: é a ordem em que a
    // pessoa vinculou, e é a que ela vê na tela.
    const linhas = instrucaoIds
      .filter((id) => porId.has(id))
      .map((id, indice) => {
        const instrucao = porId.get(id)!;
        const valor = valores.get(id)?.valor ?? 0;
        return {
          solicitacao_id: solicitacaoId,
          instrucao_id: id,
          descricao: this.rotulo(instrucao.codigo, instrucao.nome),
          quantidade: 1,
          preco_unitario_original: valor,
          preco_unitario: valor,
          ordem: indice + 1,
        };
      });

    if (linhas.length > 0) {
      await db.solicitacoes_itens.createMany({ data: linhas });
    }

    await this.recalcular(solicitacaoId, db);
  }

  /** "INST-003 - Troca de rolamento", ou só o nome quando não há código. */
  private rotulo(codigo: string | null | undefined, nome: string): string {
    const limpa = codigo?.trim();
    return limpa ? `${limpa} - ${nome}` : nome;
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

    const componentes = this.componentesBdi(solicitacao);
    // Os impostos com 100% ou mais: a fórmula divide por (1 - I), e o BDI saía zero calado
    if (componentes.i >= 1) {
      throw new BadRequestException('Os impostos do BDI (PIS, COFINS, CPRB e ISSQN) somam 100% ou mais: a conta do BDI não fecha.');
    }
    const bdi = this.calcularBdi(componentes);
    const totalBdi = this.centavos(baseDoBdi * bdi);
    const totalGeral = this.centavos(baseDoBdi + totalBdi + custoFD);
    const bdiPercentual = Math.round(bdi * 100 * 1000) / 1000;

    // O que as colunas guardam (Decimal(6, 3) e Decimal(14, 2)): passou disso, o banco recusava com 500
    if (bdiPercentual > TETO_DO_BDI || Math.max(totalCusto, totalBdi, totalGeral) > TETO_DO_TOTAL) {
      throw new BadRequestException(
        'A proposta passa do que se guarda (BDI até 999,999% e total até R$ 999.999.999.999,99): confira os percentuais do BDI e os valores.',
      );
    }

    await db.solicitacoes_servico.update({
      where: { id: solicitacaoId },
      data: {
        total_custo: totalCusto,
        total_bdi: totalBdi,
        // Três casas: 30,44% arredondado para 30,4% já move o total de uma
        // proposta grande em dezenas de reais.
        bdi_percentual: bdiPercentual,
        total_geral: totalGeral,
      },
    });

    return { totalCusto, totalBdi, totalGeral, custoFD, bdi };
  }

  // ============================================================
  // LEITURA
  // ============================================================

  /**
   * As instruções vinculadas com alguma linha sem preço no cadastro (SN-86). A
   * sugestão de valor conta essa linha como zero; sem o aviso, o valor parecia
   * completo e a proposta saía abaixo do custo.
   */
  private async instrucoesSemPreco(solicitacaoId: string): Promise<string[]> {
    const vinculos = await this.prisma.solicitacoes_instrucoes.findMany({
      where: { solicitacao_id: solicitacaoId },
      select: { instrucao_id: true },
    });
    const ids = vinculos.map((v) => v.instrucao_id.trim());
    if (!ids.length) return [];
    const valores = await valoresDasInstrucoes(this.prisma, ids);
    return ids.filter((id) => valores.get(id)?.semPreco);
  }

  async obter(solicitacaoId: string) {
    const [itens, outros, solicitacao, instrucoesSemPreco] = await Promise.all([
      this.prisma.solicitacoes_itens.findMany({
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
      this.instrucoesSemPreco(solicitacaoId),
    ]);

    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');

    return {
      itens,
      outros_custos: outros,
      /** As instruções cujo valor sugerido conta como zero alguma linha sem preço no cadastro */
      instrucoes_sem_preco: instrucoesSemPreco,
      /**
       * OBSOLETO, e só por isso ainda está aqui.
       *
       * A proposta não copia mais o escopo, e nada no front lê este campo.
       * Ele volta vazio para o front ANTERIOR não quebrar durante o deploy:
       * aquele lê `proposta.subinstrucoes.length` sem proteção, e o backend
       * sobe primeiro — quem estivesse com a tela aberta veria a seção da
       * proposta virar tela branca até recarregar.
       *
       * Pode sair depois que o front novo estiver em produção há tempo
       * suficiente para ninguém mais ter o antigo carregado.
       */
      subinstrucoes: [] as never[],
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
      await this.travarParaEditar(tx, solicitacaoId);
      await tx.solicitacoes_itens.deleteMany({ where: { solicitacao_id: solicitacaoId } });

      if (itens.length > 0) {
        await tx.solicitacoes_itens.createMany({
          data: itens.map((i, indice) => ({
            solicitacao_id: solicitacaoId,
            instrucao_id: i.instrucao_id?.trim() || null,
            recurso_id: i.recurso_id?.trim() || null,
            descricao: i.descricao.trim(),
            unidade: i.unidade?.trim() || null,
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
      await this.travarParaEditar(tx, solicitacaoId);
      await tx.solicitacoes_outros_custos.deleteMany({
        where: { solicitacao_id: solicitacaoId },
      });

      if (custos.length > 0) {
        await tx.solicitacoes_outros_custos.createMany({
          data: custos.map((c, indice) => ({
            solicitacao_id: solicitacaoId,
            descricao: c.descricao.trim(),
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
   * Os componentes do BDI. Recalcula em seguida.
   *
   * O REIDI (Regime Especial de Incentivos para o Desenvolvimento da
   * Infraestrutura) desonera PIS e COFINS. Trocar o regime zera os dois — ou
   * os devolve ao padrão —, e a pessoa ainda pode ajustar cada um depois.
   */
  async salvarCondicoes(
    solicitacaoId: string,
    dados: CondicoesDaPropostaDto,
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
      // Vazio chega null (`VazioEhNulo`): não muda o gravado
      const valor = dados[campo];
      if (valor !== undefined && valor !== null) data[campo] = valor;
    }

    if (dados.bdi_regime === 'COM_REIDI' || dados.bdi_regime === 'SEM_REIDI') {
      data.bdi_regime = dados.bdi_regime;

      // Só mexe em PIS e COFINS se o próprio pedido não os trouxe: quem manda
      // regime E percentual está dizendo exatamente o que quer.
      if (data.bdi_pis === undefined) data.bdi_pis = dados.bdi_regime === 'COM_REIDI' ? 0 : 0.65;
      if (data.bdi_cofins === undefined) data.bdi_cofins = dados.bdi_regime === 'COM_REIDI' ? 0 : 3.0;
    }

    // Numa transação: o BDI que estoura a conta é 400 no `recalcular`, e antes o update já tinha
    // gravado o percentual ruim, que travava toda escrita seguinte da proposta
    await this.prisma.$transaction(async (tx) => {
      await this.travarParaEditar(tx, solicitacaoId);
      if (Object.keys(data).length > 0) {
        await tx.solicitacoes_servico.update({ where: { id: solicitacaoId }, data });
      }
      await this.recalcular(solicitacaoId, tx);
    });
    return this.obter(solicitacaoId);
  }

  /**
   * Refaz a lista pelas instruções vinculadas (a rota "recarregar"), na mesma
   * transação da trava: antes apagava os itens e, se a conta falhasse, a
   * proposta ficava sem eles.
   */
  async recarregar(solicitacaoId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.travarParaEditar(tx, solicitacaoId);
      await this.materializarDeInstrucoes(solicitacaoId, tx);
    });
    return this.obter(solicitacaoId);
  }
}
