// src/modules/solicitacoes-servico/proposta.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core';
import { Prisma, type StatusSolicitacaoServico } from '@prisma/client';
import { nomeDoAutor } from '@/common/helpers/status-da-origem';
import { valoresDasInstrucoes } from '../instrucoes/valor-da-instrucao';
import { variantesDeIds } from '../tarefas/ids';
import { registrarNotificacao } from '../notificacoes/registrar-notificacao';
import type { CondicoesDaPropostaDto, LinhaDeLogisticaDto, PadroesDaPropostaDto } from './dto/proposta.dto';
import { totalDaLinha, type ContaDaProposta, type TabelaDeLogistica } from './conta-da-proposta';
import { colunasDosPercentuais, padroesDaProposta, percentuaisDe } from './padroes-da-proposta';
import { contaGravada, linhaDeLogisticaLida, recalcularProposta } from './recalculo-da-proposta';

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
 *
 * A conta (29/out/2026) é por imposto e margem (`conta-da-proposta.ts`), com o
 * frete, o deslocamento e as diárias em tabelas da proposta. A de antes, pelo
 * BDI, fica nas propostas programadas e finalizadas, como documento.
 */
/** O teto das colunas dos totais, Decimal(14, 2) */
const TETO_DO_TOTAL = 999_999_999_999.99;

/** "R$ 1.234,56", para a mensagem de erro */
const reais = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** As horas de uma jornada: a sugestão de dias é a soma das horas dos passos ÷ 8 (a spec) */
const HORAS_POR_DIA = 8;

const PERCENTUAIS = ['imposto_percentual', 'margem_percentual', 'adm_servicos_percentual', 'adm_fd_percentual'] as const;
const PLANEJAMENTO = ['distancia_km', 'distancia_ida_volta_km', 'dias_previstos', 'pessoas_previstas', 'noites_fora'] as const;

/** A proposta que voltou à edição: o que a revisão e a recusa gravaram sai junto */
const SEM_REVISAO = { aprovado_por_id: null, aprovado_por_nome: null, data_aprovacao: null } as const;
const SEM_RECUSA = { rejeitado_por_id: null, data_rejeicao: null, motivo_rejeicao: null } as const;

@Injectable()
export class PropostaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Decimal do Prisma para número, sem passar por string solta. */
  private num(valor: Prisma.Decimal | number | null | undefined): number {
    if (valor === null || valor === undefined) return 0;
    const n = typeof valor === 'object' ? valor.toNumber() : Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  private numOuNulo(valor: Prisma.Decimal | number | null | undefined): number | null {
    return valor === null || valor === undefined ? null : this.num(valor);
  }

  /**
   * O status da solicitação, travada (FOR UPDATE) dentro da transação de quem a
   * muda: duas gravações da mesma proposta se enfileiram. Sem a trava, as duas
   * apagavam a lista antiga, cada uma inseria a sua, e a proposta saía com as
   * linhas em dobro. A que não existe é 404.
   */
  private async travar(tx: Prisma.TransactionClient, solicitacaoId: string): Promise<StatusSolicitacaoServico> {
    const [solicitacao] = await tx.$queryRaw<{ status: StatusSolicitacaoServico }[]>`
      SELECT status::text AS status FROM solicitacoes_servico
       WHERE id = ${solicitacaoId} AND deleted_at IS NULL
       FOR UPDATE`;
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');
    return solicitacao.status;
  }

  /**
   * Trava a solicitação para escrever a proposta (SN-94). Só a REGISTRADA se
   * edita (409), como o PATCH da solicitação e a tela: a revisada se reabre
   * antes (29/out/2026), e a programada tem a proposta que o cliente aceitou.
   */
  private async travarParaEditar(tx: Prisma.TransactionClient, solicitacaoId: string): Promise<void> {
    const status = await this.travar(tx, solicitacaoId);
    if (status === 'PROPOSTA_REVISADA' || status === 'NAO_APROVADA') {
      throw new ConflictException('A proposta já foi revisada: reabra-a para editar.');
    }
    if (status !== 'REGISTRADA') {
      throw new ConflictException('A proposta só se edita com a solicitação registrada: depois de programada, é a que o cliente aceitou.');
    }
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

  /**
   * Recalcula e GRAVA os totais, pela conta de imposto e margem
   * (`recalculo-da-proposta.ts`). A proposta do BDI que chega aqui (só a
   * REGISTRADA se edita) passa para a conta nova, com os percentuais padrão.
   */
  async recalcular(solicitacaoId: string, tx?: Prisma.TransactionClient): Promise<ContaDaProposta> {
    return recalcularProposta(tx ?? this.prisma, solicitacaoId);
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
    const ids = await this.idsDasInstrucoes(solicitacaoId);
    if (!ids.length) return [];
    const valores = await valoresDasInstrucoes(this.prisma, ids);
    return ids.filter((id) => valores.get(id)?.semPreco);
  }

  private async idsDasInstrucoes(solicitacaoId: string): Promise<string[]> {
    const vinculos = await this.prisma.solicitacoes_instrucoes.findMany({
      where: { solicitacao_id: solicitacaoId },
      select: { instrucao_id: true },
    });
    return vinculos.map((v) => v.instrucao_id.trim());
  }

  /**
   * Os dias que a spec sugere: as horas dos passos das instruções, em sequência
   * (sem inventar simultaneidade), em jornadas de 8 h, arredondado para cima
   * (6h20 dá 1 dia; 9 h, 2). Nulo sem hora nenhuma: a pessoa digita os dias.
   */
  private async diasSugeridos(solicitacaoId: string): Promise<number | null> {
    const ids = await this.idsDasInstrucoes(solicitacaoId);
    if (!ids.length) return null;
    const { _sum } = await this.prisma.sub_instrucoes.aggregate({
      where: { instrucao_id: { in: ids } },
      _sum: { duracao_horas: true },
    });
    const horas = this.num(_sum.duracao_horas);
    return horas > 0 ? Math.ceil(horas / HORAS_POR_DIA) : null;
  }

  async obter(solicitacaoId: string) {
    const [itens, outros, logistica, solicitacao, instrucoesSemPreco, diasSugeridos] = await Promise.all([
      this.prisma.solicitacoes_itens.findMany({
        where: { solicitacao_id: solicitacaoId },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.solicitacoes_outros_custos.findMany({
        where: { solicitacao_id: solicitacaoId },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.solicitacoes_logistica.findMany({
        where: { solicitacao_id: solicitacaoId },
        orderBy: [{ tabela: 'asc' }, { ordem: 'asc' }],
      }),
      this.prisma.solicitacoes_servico.findFirst({
        where: { id: solicitacaoId },
        select: {
          conta_da_proposta: true,
          distancia_km: true,
          distancia_ida_volta_km: true,
          dias_previstos: true,
          pessoas_previstas: true,
          noites_fora: true,
          imposto_percentual: true,
          margem_percentual: true,
          adm_servicos_percentual: true,
          adm_fd_percentual: true,
          validade_proposta: true,
          condicoes_comerciais: true,
          total_custo: true,
          total_servicos: true,
          total_fd: true,
          total_administracao: true,
          total_aupus: true,
          valor_imposto: true,
          margem_efetiva: true,
          total_geral: true,
          desconto_tipo: true,
          desconto_valor: true,
          total_desconto: true,
          // A conta de antes (as propostas programadas e finalizadas, como documento)
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
          total_bdi: true,
        },
      }),
      this.instrucoesSemPreco(solicitacaoId),
      this.diasSugeridos(solicitacaoId),
    ]);

    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');
    const s = solicitacao;
    // A conta nova, sem gravar: o preço de venda de cada linha (a tela e o PDF do cliente)
    const conta = s.conta_da_proposta === 'IMPOSTO_MARGEM' ? await contaGravada(this.prisma, solicitacaoId) : null;

    return {
      /** IMPOSTO_MARGEM (29/out/2026) ou BDI (a proposta de antes, como documento) */
      conta_da_proposta: s.conta_da_proposta,
      // `valor_venda`: o preço da linha na proposta (a parte dela no preço dos serviços)
      itens: itens.map((item, i) => ({ ...item, valor_venda: conta ? (conta.venda.instrucoes[i] ?? 0) : null })),
      outros_custos: outros,
      logistica: logistica.map(linhaDeLogisticaLida),
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
       */
      subinstrucoes: [] as never[],
      // O planejamento
      distancia_km: this.numOuNulo(s.distancia_km),
      distancia_ida_volta_km: this.numOuNulo(s.distancia_ida_volta_km),
      dias_previstos: this.numOuNulo(s.dias_previstos),
      dias_sugeridos: diasSugeridos,
      pessoas_previstas: s.pessoas_previstas,
      noites_fora: s.noites_fora,
      // Os percentuais da proposta
      imposto_percentual: this.numOuNulo(s.imposto_percentual),
      margem_percentual: this.numOuNulo(s.margem_percentual),
      adm_servicos_percentual: this.numOuNulo(s.adm_servicos_percentual),
      adm_fd_percentual: this.numOuNulo(s.adm_fd_percentual),
      validade_proposta: s.validade_proposta ? s.validade_proposta.toISOString().slice(0, 10) : null,
      condicoes_comerciais: s.condicoes_comerciais,
      // Os totais gravados
      total_custo: this.num(s.total_custo),
      total_servicos: this.numOuNulo(s.total_servicos),
      total_fd: this.numOuNulo(s.total_fd),
      total_administracao: this.numOuNulo(s.total_administracao),
      total_aupus: this.numOuNulo(s.total_aupus),
      valor_imposto: this.numOuNulo(s.valor_imposto),
      // A da conta ao vivo: a gravada vira nula fora do teto da coluna (o desconto que zera a Aupus), e o aviso sumia
      margem_efetiva: conta ? conta.margemEfetiva : this.numOuNulo(s.margem_efetiva),
      total_geral: this.num(s.total_geral),
      /** O desconto: o tipo e o digitado; `total_desconto` são os reais descontados (até o faturamento da Aupus) */
      desconto_tipo: s.desconto_tipo,
      desconto_valor: this.numOuNulo(s.desconto_valor),
      total_desconto: this.num(s.total_desconto),
      /** A memória da conta nova (o fechamento da tela): interna, nula na de antes */
      fechamento: conta
        ? {
            custo_instrucoes: conta.custoInstrucoes,
            custo_logistica: conta.custoLogistica,
            custo_adicionais: conta.custoAdicionais,
            custo_servicos: conta.custoServicos,
            preco_servicos: conta.precoServicos,
            administracao: conta.administracao,
            preco_administracao: conta.precoAdministracao,
            total_aupus_sem_desconto: conta.totalAupusSemDesconto,
            total_geral_sem_desconto: conta.totalGeralSemDesconto,
            desconto_pedido: conta.desconto.pedido,
          }
        : null,
      /** O preço de venda da logística e dos adicionais, uma linha cada no PDF */
      venda: conta ? { logistica: conta.venda.logistica, adicionais: conta.venda.adicionais } : null,
      bdi_regime: s.bdi_regime,
      bdi_administracao_central: this.num(s.bdi_administracao_central),
      bdi_seguro_garantia: this.num(s.bdi_seguro_garantia),
      bdi_taxa_risco: this.num(s.bdi_taxa_risco),
      bdi_despesas_financeiras: this.num(s.bdi_despesas_financeiras),
      bdi_lucro: this.num(s.bdi_lucro),
      bdi_pis: this.num(s.bdi_pis),
      bdi_cofins: this.num(s.bdi_cofins),
      bdi_cprb: this.num(s.bdi_cprb),
      bdi_issqn: this.num(s.bdi_issqn),
      bdi_percentual: this.numOuNulo(s.bdi_percentual),
      total_bdi: this.numOuNulo(s.total_bdi),
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
   * Substitui uma tabela de logística inteira (frete, deslocamento ou diárias,
   * 29/out/2026). O total de cada linha é calculado aqui, pela tabela dela: o
   * que o front manda são as colunas, nunca o total.
   */
  async salvarLogistica(solicitacaoId: string, tabela: TabelaDeLogistica, linhas: LinhaDeLogisticaDto[]) {
    const data = linhas.map((l, indice) => {
      const total = totalDaLinha({ ...l, tabela });
      if (total > TETO_DO_TOTAL) {
        throw new BadRequestException(`A linha ${indice + 1} passa do que se guarda (até R$ 999.999.999.999,99): confira os valores.`);
      }
      return {
        solicitacao_id: solicitacaoId,
        tabela,
        ativo: l.ativo ?? true,
        recurso_id: l.recurso_id?.trim() || null,
        descricao: l.descricao.trim(),
        quantidade: l.quantidade ?? null,
        valor_unitario: l.valor_unitario ?? null,
        dias: l.dias ?? null,
        km: l.km ?? null,
        valor_km: l.valor_km ?? null,
        valor_fixo: l.valor_fixo ?? null,
        total,
        ordem: indice + 1,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await this.travarParaEditar(tx, solicitacaoId);
      await tx.solicitacoes_logistica.deleteMany({ where: { solicitacao_id: solicitacaoId, tabela } });
      if (data.length > 0) await tx.solicitacoes_logistica.createMany({ data });
      await this.recalcular(solicitacaoId, tx);
    });
    return this.obter(solicitacaoId);
  }

  /**
   * As condições (29/out/2026): os percentuais da proposta, o planejamento, a
   * validade, as condições comerciais e o desconto. Recalcula em seguida.
   * Percentual vazio não muda o gravado; o planejamento vazio apaga.
   */
  async salvarCondicoes(solicitacaoId: string, dados: CondicoesDaPropostaDto) {
    const data: Prisma.solicitacoes_servicoUpdateInput = {};

    for (const campo of PERCENTUAIS) {
      const valor = dados[campo];
      if (valor !== undefined && valor !== null) data[campo] = valor;
    }
    for (const campo of PLANEJAMENTO) {
      if (dados[campo] !== undefined) data[campo] = dados[campo];
    }
    if (dados.validade_proposta !== undefined) data.validade_proposta = dados.validade_proposta;
    if (dados.condicoes_comerciais !== undefined) data.condicoes_comerciais = dados.condicoes_comerciais?.trim() || null;

    // O desconto: o tipo null tira; o tipo pede o valor (o que veio ou o gravado)
    const mexeNoDesconto = dados.desconto_tipo !== undefined || dados.desconto_valor !== undefined;
    if (dados.desconto_tipo === null) {
      data.desconto_tipo = null;
      data.desconto_valor = null;
    } else if (dados.desconto_tipo) {
      // Dar o tipo pede o valor: o gravado é do outro tipo (12,5% viraria R$ 12,50)
      data.desconto_tipo = dados.desconto_tipo;
      data.desconto_valor = dados.desconto_valor ?? null;
    } else if (dados.desconto_valor !== undefined) {
      data.desconto_valor = dados.desconto_valor;
    }

    // Numa transação: o imposto e a margem que somam 100% são 400 no `recalcular`, e o
    // percentual ruim não pode ficar gravado (travaria toda escrita seguinte da proposta)
    await this.prisma.$transaction(async (tx) => {
      await this.travarParaEditar(tx, solicitacaoId);
      if (Object.keys(data).length > 0) {
        await tx.solicitacoes_servico.update({ where: { id: solicitacaoId }, data });
      }
      const conta = await this.recalcular(solicitacaoId, tx);
      if (mexeNoDesconto) await this.conferirDesconto(tx, solicitacaoId, conta);
    });
    return this.obter(solicitacaoId);
  }

  /**
   * O desconto que se acabou de gravar fecha com a conta (dentro da transação:
   * recusado, nada fica). Ele é pedido sobre o total inteiro e sai do
   * faturamento da Aupus (o faturamento direto é nota do fornecedor): quem o
   * digita não grava um maior que esse faturamento. Se depois a conta cai abaixo
   * dele, o aplicado para no faturamento, e a tela mostra o pedido e o aplicado.
   */
  private async conferirDesconto(tx: Prisma.TransactionClient, solicitacaoId: string, conta: ContaDaProposta): Promise<void> {
    const { desconto_tipo: tipo, desconto_valor } = await tx.solicitacoes_servico.findUniqueOrThrow({
      where: { id: solicitacaoId },
      select: { desconto_tipo: true, desconto_valor: true },
    });
    const valor = this.numOuNulo(desconto_valor);
    // O valor sem o tipo ficaria guardado e voltaria calado quando alguém escolhesse o tipo
    if (!tipo) {
      if (valor !== null) throw new BadRequestException('Diga se o desconto é em percentual ou em reais.');
      return;
    }
    if (valor === null) throw new BadRequestException('Diga o valor do desconto (o percentual ou os reais).');
    if (tipo === 'PERCENTUAL' && valor > 100) throw new BadRequestException('O desconto em percentual vai até 100%.');
    if (conta.desconto.pedido > conta.totalAupusSemDesconto) {
      throw new BadRequestException(
        `O desconto (${reais(conta.desconto.pedido)}) passa do faturamento da Aupus (${reais(conta.totalAupusSemDesconto)}): o faturamento direto é pago ao fornecedor.`,
      );
    }
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

  // ============================================================
  // PADRÕES
  // ============================================================

  /** Os percentuais padrão da proposta: o que a solicitação nova copia */
  async obterPadroes() {
    return colunasDosPercentuais(await padroesDaProposta(this.prisma));
  }

  /**
   * Troca os padrões (29/out/2026). Valem para a solicitação nova: a que existe
   * fica com os seus, porque a proposta é documento e pode já ter ido ao cliente.
   */
  async salvarPadroes(dados: PadroesDaPropostaDto, usuarioId?: string) {
    const percentuais = percentuaisDe(dados);
    if (percentuais.imposto + percentuais.margem >= 100) {
      throw new BadRequestException('O imposto e a margem somam 100% ou mais: o preço não fecha.');
    }
    const quem = { updated_by: usuarioId?.trim() || null, updated_at: new Date() };
    await this.prisma.padroes_da_proposta.upsert({
      where: { id: 1 },
      create: { id: 1, ...colunasDosPercentuais(percentuais), ...quem },
      update: { ...colunasDosPercentuais(percentuais), ...quem },
    });
    return this.obterPadroes();
  }

  // ============================================================
  // REVISÃO (29/out/2026)
  //
  //   REGISTRADA --revisar--> PROPOSTA_REVISADA --programar--> PROGRAMADA
  //       ^                       |
  //       +------- reabrir -------+   (e da NAO_APROVADA)
  //   REGISTRADA ou PROPOSTA_REVISADA --não aprovada--> NAO_APROVADA
  //
  // Só a revisada se programa: a programação herda dela as instruções, os
  // valores e a logística. Revisar trava a proposta; reabrir a devolve à edição.
  // ============================================================

  /** REGISTRADA -> PROPOSTA_REVISADA, com quem revisou e quando */
  async revisar(solicitacaoId: string, usuarioId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const status = await this.travar(tx, solicitacaoId);
      if (status !== 'REGISTRADA') throw new ConflictException(this.naoSeMuda(status, 'revisar'));
      await this.semProgramacaoAberta(tx, solicitacaoId, 'revisar');
      // A do BDI não se revisa calada: a conversão mudaria o total que a pessoa viu na tela
      const { conta_da_proposta } = await tx.solicitacoes_servico.findUniqueOrThrow({ where: { id: solicitacaoId }, select: { conta_da_proposta: true } });
      if (conta_da_proposta !== 'IMPOSTO_MARGEM') {
        throw new ConflictException('A proposta está na conta antiga (BDI): passe-a para imposto e margem e confira os valores antes de revisar.');
      }
      await this.mesmasInstrucoes(tx, solicitacaoId);
      // Os totais da revisão são os da conta de agora
      await this.recalcular(solicitacaoId, tx);
      const autor = await nomeDoAutor(tx, usuarioId);
      await tx.solicitacoes_servico.update({
        where: { id: solicitacaoId },
        data: { status: 'PROPOSTA_REVISADA', aprovado_por_id: usuarioId?.trim() || null, aprovado_por_nome: autor, data_aprovacao: new Date(), ...SEM_RECUSA },
      });
      await this.historico(tx, solicitacaoId, { acao: 'PROPOSTA_REVISADA', autor, usuarioId, observacoes: 'Proposta revisada', de: status, para: 'PROPOSTA_REVISADA' });
      await registrarNotificacao(tx, { evento: 'solicitacao.proposta_revisada', entidade: 'solicitacao_servico', entidadeId: solicitacaoId, atorId: usuarioId });
    });
  }

  /** PROPOSTA_REVISADA ou NAO_APROVADA -> REGISTRADA: a proposta volta à edição */
  async reabrir(solicitacaoId: string, usuarioId?: string, motivo?: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const status = await this.travar(tx, solicitacaoId);
      if (status !== 'PROPOSTA_REVISADA' && status !== 'NAO_APROVADA') throw new ConflictException(this.naoSeMuda(status, 'reabrir'));
      const autor = await nomeDoAutor(tx, usuarioId);
      await tx.solicitacoes_servico.update({ where: { id: solicitacaoId }, data: { status: 'REGISTRADA', ...SEM_REVISAO, ...SEM_RECUSA } });
      await this.historico(tx, solicitacaoId, { acao: 'PROPOSTA_REABERTA', autor, usuarioId, observacoes: motivo?.trim() || 'Proposta reaberta', de: status, para: 'REGISTRADA' });
    });
  }

  /** REGISTRADA ou PROPOSTA_REVISADA -> NAO_APROVADA: o cliente não aceitou, com o motivo */
  async naoAprovada(solicitacaoId: string, motivo: string, usuarioId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const status = await this.travar(tx, solicitacaoId);
      if (status !== 'REGISTRADA' && status !== 'PROPOSTA_REVISADA') throw new ConflictException(this.naoSeMuda(status, 'recusar'));
      await this.semProgramacaoAberta(tx, solicitacaoId, 'recusar');
      const autor = await nomeDoAutor(tx, usuarioId);
      await tx.solicitacoes_servico.update({
        where: { id: solicitacaoId },
        data: { status: 'NAO_APROVADA', rejeitado_por_id: usuarioId?.trim() || null, data_rejeicao: new Date(), motivo_rejeicao: motivo.trim() },
      });
      await this.historico(tx, solicitacaoId, { acao: 'PROPOSTA_NAO_APROVADA', autor, usuarioId, observacoes: motivo.trim(), de: status, para: 'NAO_APROVADA' });
    });
  }

  /**
   * A solicitação com programação em aberto não se revisa nem se recusa: a de antes
   * desta regra pode estar REGISTRADA com uma programação pendente (o `aprovar` só a
   * leva a PROGRAMADA depois), e revisá-la abriria uma segunda OS; recusá-la deixaria
   * a OS seguir para uma proposta não aprovada.
   */
  private async semProgramacaoAberta(tx: Prisma.TransactionClient, solicitacaoId: string, acao: 'revisar' | 'recusar'): Promise<void> {
    const ids = variantesDeIds([solicitacaoId]);
    const aberta = await tx.programacoes_os.findFirst({
      where: {
        deletado_em: null,
        status: { in: ['PENDENTE', 'APROVADA'] },
        OR: [{ solicitacao_servico_id: { in: ids } }, ...ids.map((id) => ({ dados_origem: { path: ['solicitacaoServicoId'], equals: id } }))],
      },
      select: { codigo: true },
    });
    if (aberta) {
      const oQue = acao === 'revisar' ? 'revisar' : 'marcar como não aprovada';
      throw new ConflictException(`A solicitação já tem a programação ${aberta.codigo.trim()} em aberto: cancele-a antes de ${oQue} a proposta.`);
    }
  }

  /**
   * A proposta revisada tem uma linha para cada instrução vinculada, e só elas: a
   * linha nasce quando a tela vincula, e o vínculo só quando o formulário salva —
   * cancelado o formulário, sobrava a linha de uma instrução que a programação não
   * recebe (o preço aceito incluía um serviço que não seria feito), ou o contrário.
   */
  private async mesmasInstrucoes(tx: Prisma.TransactionClient, solicitacaoId: string): Promise<void> {
    const [vinculos, itens] = await Promise.all([
      tx.solicitacoes_instrucoes.findMany({ where: { solicitacao_id: solicitacaoId, instrucao: { deleted_at: null } }, select: { instrucao_id: true } }),
      tx.solicitacoes_itens.findMany({ where: { solicitacao_id: solicitacaoId, instrucao_id: { not: null }, recurso_id: null }, select: { instrucao_id: true, descricao: true } }),
    ]);
    const vinculadas = new Set(vinculos.map((v) => v.instrucao_id.trim()));
    const naProposta = new Set(itens.map((i) => i.instrucao_id!.trim()));
    const semLinha = [...vinculadas].filter((id) => !naProposta.has(id));
    const semVinculo = itens.filter((i) => !vinculadas.has(i.instrucao_id!.trim())).map((i) => i.descricao.trim());
    if (semLinha.length > 0 || semVinculo.length > 0) {
      const partes = [
        semVinculo.length > 0 && `com valor na proposta e sem vínculo: ${semVinculo.join(', ')}`,
        semLinha.length > 0 && `${semLinha.length} vinculada(s) sem valor na proposta`,
      ].filter(Boolean);
      throw new ConflictException(`As instruções da proposta não batem com as vinculadas (${partes.join('; ')}): abra a edição, confira e salve antes de revisar.`);
    }
  }

  private naoSeMuda(status: StatusSolicitacaoServico, acao: 'revisar' | 'reabrir' | 'recusar'): string {
    const ondeEsta: Record<StatusSolicitacaoServico, string> = {
      REGISTRADA: 'ainda está em edição',
      PROPOSTA_REVISADA: 'já foi revisada',
      PROGRAMADA: 'já foi programada: cancele a programação antes',
      FINALIZADA: 'já foi finalizada',
      NAO_APROVADA: 'foi marcada como não aprovada: reabra-a antes',
    };
    const oQue = { revisar: 'Não dá para revisar', reabrir: 'Não dá para reabrir', recusar: 'Não dá para marcar como não aprovada' }[acao];
    return `${oQue}: a proposta ${ondeEsta[status]}.`;
  }

  private async historico(
    tx: Prisma.TransactionClient,
    solicitacaoId: string,
    e: { acao: string; autor: string; usuarioId?: string; observacoes: string; de: StatusSolicitacaoServico; para: StatusSolicitacaoServico },
  ): Promise<void> {
    await tx.historico_solicitacao_servico.create({
      data: {
        solicitacao_id: solicitacaoId,
        acao: e.acao,
        usuario_nome: e.autor,
        usuario_id: e.usuarioId?.trim() || null,
        observacoes: e.observacoes,
        status_anterior: e.de,
        status_novo: e.para,
      },
    });
  }
}
