import { ConflictException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, PrismaService, StatusSolicitacaoServico } from '@/core';
import { equipamentoNasPlantas } from '@/core/modules/auth/planta-dos-equipamentos';
import { SolicitacoesServicoService } from '../solicitacoes-servico/solicitacoes-servico.service';
import { comOLugarAparado } from '../solicitacoes-servico/lugar-da-solicitacao';
import { colunasDosPercentuais, padroesDaProposta } from '../solicitacoes-servico/padroes-da-proposta';
import { registrarNotificacao } from '../notificacoes/registrar-notificacao';
import { ChamadoNexonDto } from './dto/chamado-nexon.dto';
import { montarSolicitacao } from './chamados-nexon';

export interface OrigemRequisicao {
  ip?: string | null;
  user_agent?: string | null;
}

/**
 * Recebe o chamado do NexON e vira solicitacao de servico.
 *
 * Idempotente por `nexon_chamado_id` (coluna unica): a fila do NexON tenta de
 * novo quando a resposta nao chega, e a segunda entrega tem que devolver a mesma
 * solicitacao, nunca criar outra.
 *
 * A trilha fica em `historico_solicitacao_servico` (acao RECEBIDA_NEXON), com o
 * numero e o id do chamado, o autor, ip e user agent em `dados_extras` — e a
 * solicitacao guarda `nexon_chamado_id` para achar pelo chamado:
 *
 *   SELECT s.numero, h.data, h.dados_extras FROM solicitacoes_servico s
 *   JOIN historico_solicitacao_servico h ON h.solicitacao_id = s.id
 *   WHERE s.nexon_chamado_id = '<id>' OR h.dados_extras->>'nexon_numero' = '12';
 */
@Injectable()
export class ChamadosNexonService {
  private readonly logger = new Logger(ChamadosNexonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly solicitacoes: SolicitacoesServicoService,
  ) {}

  async receber(dto: ChamadoNexonDto, origem: OrigemRequisicao = {}) {
    const existente = await this.buscar(dto.nexon_chamado_id);
    if (existente) return this.jaRecebida(dto, existente);

    for (let tentativa = 1; ; tentativa++) {
      try {
        return { ...(await this.criar(dto, origem)), criada: true };
      } catch (erro) {
        if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2002') throw erro;
        const alvo = String(erro.meta?.target ?? '');
        // Duas entregas do mesmo chamado ao mesmo tempo: a outra ganhou.
        if (alvo.includes('nexon_chamado_id')) {
          const ganhou = await this.buscar(dto.nexon_chamado_id);
          if (ganhou) return this.jaRecebida(dto, ganhou);
        }
        // Numero da solicitacao colidiu com uma criacao simultanea: tenta o seguinte.
        if (!alvo.includes('numero') || tentativa >= 3) throw erro;
        this.logger.warn(`Numero de solicitacao colidiu; tentativa ${tentativa + 1}`);
      }
    }
  }

  private buscar(nexonChamadoId: string) {
    return this.prisma.solicitacoes_servico.findUnique({
      where: { nexon_chamado_id: nexonChamadoId },
      select: { id: true, numero: true, status: true, deleted_at: true },
    });
  }

  /**
   * O chamado ja virou solicitacao. Aberta, a entrega repetida (a fila do NexON
   * tenta de novo quando a resposta nao chega) devolve a mesma. Finalizada ou
   * excluida, o reencaminhamento (o equipamento voltou a falhar) era descartado
   * com 200 e ninguem no Service ficava sabendo: agora e 409, e o NexON mostra
   * a falha do encaminhamento.
   */
  private jaRecebida(
    dto: ChamadoNexonDto,
    existente: { id: string; numero: string; status: StatusSolicitacaoServico; deleted_at: Date | null },
  ) {
    const fechada = existente.deleted_at
      ? 'excluída'
      : existente.status === StatusSolicitacaoServico.FINALIZADA
        ? 'finalizada'
        : existente.status === StatusSolicitacaoServico.NAO_APROVADA
          ? 'com a proposta não aprovada'
          : null;
    if (fechada) {
      throw new ConflictException(
        `O chamado #${dto.numero} já virou a solicitação ${existente.numero}, ${fechada} no Smart Service. Abra um chamado novo no NexON.`,
      );
    }
    return { id: existente.id, numero: existente.numero, criada: false };
  }

  private async criar(dto: ChamadoNexonDto, origem: OrigemRequisicao) {
    const planta = await this.prisma.plantas.findFirst({
      where: { id: dto.planta_id.trim(), deleted_at: null },
      select: { id: true, nome: true, proprietario_id: true },
    });
    // Sem planta nao existe solicitacao (coluna obrigatoria). 422 e definitivo
    // para quem le: o NexON tenta de novo e, se a planta for sincronizada no
    // meio, a tentativa seguinte passa.
    if (!planta) {
      throw new UnprocessableEntityException(
        `Planta ${dto.planta_id} não está sincronizada com o Smart Service`,
      );
    }

    // Equipamento, unidade e proprietario so entram se forem DESTA planta. Id de
    // outra planta (cadastro divergente entre os dois bancos) vira texto em
    // `faltando`, nunca uma solicitacao pendurada no ativo de outro cliente. A
    // planta do equipamento e a regra do formulario (SN-12): a da unidade, a da
    // unidade do UC pai, e a coluna antiga so sem unidade — ela fica velha
    // quando o UC muda de planta, e o NexON ainda a manda para o componente.
    const plantaId = planta.id.trim();
    const [equipamento, unidade] = await Promise.all([
      dto.equipamento_id
        ? this.prisma.equipamentos.findFirst({
            where: { id: dto.equipamento_id.trim(), deleted_at: null, ...equipamentoNasPlantas([plantaId]) },
            select: { id: true, nome: true, unidade_id: true },
          })
        : null,
      dto.unidade_id
        ? this.prisma.unidades.findFirst({
            where: { id: dto.unidade_id.trim(), planta_id: plantaId, deleted_at: null },
            select: { id: true },
          })
        : null,
    ]);
    const donoDaPlanta = planta.proprietario_id?.trim() || null;
    const proprietarioId = dto.proprietario_id?.trim() === donoDaPlanta ? donoDaPlanta : null;

    const { faltando, ...dados } = montarSolicitacao(dto, {
      planta_id: plantaId,
      equipamento,
      // O equipamento achado e desta planta: a unidade dele tambem
      unidade_id: unidade?.id ?? equipamento?.unidade_id ?? null,
      proprietario_id: proprietarioId,
      planta_nome: planta.nome,
    });

    const numero = await this.solicitacoes.gerarNumeroSolicitacao();

    const criada = await this.prisma.$transaction(async (tx) => {
      // Os ids do lugar sem o espaço do Char(26), como no formulário (SN-77): com
      // ele, a busca pelo nome da instalação e o escopo perdiam a solicitação
      const s = await tx.solicitacoes_servico.create({
        // Com o BDI padrão da empresa, como a do formulário (28/out/2026)
        data: { ...comOLugarAparado(dados), conta_da_proposta: 'IMPOSTO_MARGEM', ...colunasDosPercentuais(await padroesDaProposta(tx)), numero, status: StatusSolicitacaoServico.REGISTRADA },
        select: { id: true, numero: true },
      });
      // Aberta avisa quem programa (SN-47), como a do formulário
      await registrarNotificacao(tx, { evento: 'solicitacao.aberta', entidade: 'solicitacao_servico', entidadeId: s.id });
      await tx.historico_solicitacao_servico.create({
        data: {
          solicitacao_id: s.id,
          acao: 'RECEBIDA_NEXON',
          usuario_nome: dados.solicitante_nome,
          observacoes: `Recebida do NexON: Chamado #${dto.numero} (${planta.nome})`,
          status_novo: StatusSolicitacaoServico.REGISTRADA,
          dados_extras: {
            nexon_chamado_id: dto.nexon_chamado_id,
            nexon_numero: dto.numero,
            motivo: dto.motivo ?? null,
            prioridade: dados.prioridade,
            planta_id: plantaId,
            planta_nome: planta.nome,
            unidade_id: dto.unidade_id ?? null,
            equipamento_id: dto.equipamento_id ?? null,
            equipamento_nome: equipamento?.nome ?? null,
            proprietario_id: dto.proprietario_id ?? null,
            autor_nome: dto.autor_nome ?? null,
            aberto_em: dto.aberto_em ?? null,
            nao_sincronizados: faltando,
            ip: origem.ip ?? null,
            user_agent: origem.user_agent ?? null,
          },
        },
      });
      return s;
    });

    this.logger.log(
      `Solicitação ${criada.numero} criada do Chamado #${dto.numero} do NexON (${dto.nexon_chamado_id})` +
        (faltando.length ? ` — não sincronizado: ${faltando.join(', ')}` : ''),
    );
    return criada;
  }
}
