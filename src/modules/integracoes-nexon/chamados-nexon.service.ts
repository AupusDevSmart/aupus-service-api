import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, PrismaService, StatusSolicitacaoServico } from '@/core';
import { SolicitacoesServicoService } from '../solicitacoes-servico/solicitacoes-servico.service';
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
    if (existente) return { ...existente, criada: false };

    for (let tentativa = 1; ; tentativa++) {
      try {
        return { ...(await this.criar(dto, origem)), criada: true };
      } catch (erro) {
        if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2002') throw erro;
        const alvo = String(erro.meta?.target ?? '');
        // Duas entregas do mesmo chamado ao mesmo tempo: a outra ganhou.
        if (alvo.includes('nexon_chamado_id')) {
          const ganhou = await this.buscar(dto.nexon_chamado_id);
          if (ganhou) return { ...ganhou, criada: false };
        }
        // Numero da solicitacao colidiu com uma criacao simultanea: tenta o seguinte.
        if (!alvo.includes('numero') || tentativa >= 3) throw erro;
      }
    }
  }

  private buscar(nexonChamadoId: string) {
    return this.prisma.solicitacoes_servico.findUnique({
      where: { nexon_chamado_id: nexonChamadoId },
      select: { id: true, numero: true },
    });
  }

  private async criar(dto: ChamadoNexonDto, origem: OrigemRequisicao) {
    const planta = await this.prisma.plantas.findFirst({
      where: { id: dto.planta_id, deleted_at: null },
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
    // `faltando`, nunca uma solicitacao pendurada no ativo de outro cliente.
    const [equipamento, unidade] = await Promise.all([
      dto.equipamento_id
        ? this.prisma.equipamentos.findFirst({
            where: {
              id: dto.equipamento_id,
              deleted_at: null,
              OR: [{ planta_id: planta.id }, { unidade: { planta_id: planta.id } }],
            },
            select: { id: true, nome: true, unidade_id: true },
          })
        : null,
      dto.unidade_id
        ? this.prisma.unidades.findFirst({
            where: { id: dto.unidade_id, planta_id: planta.id, deleted_at: null },
            select: { id: true },
          })
        : null,
    ]);
    const proprietarioId =
      dto.proprietario_id && dto.proprietario_id === planta.proprietario_id?.trim() ? planta.proprietario_id : null;

    const { faltando, ...dados } = montarSolicitacao(dto, {
      equipamento,
      unidade_id: unidade?.id ?? (dto.unidade_id ? null : (equipamento?.unidade_id ?? null)),
      proprietario_id: proprietarioId,
      planta_nome: planta.nome,
    });

    const numero = await this.solicitacoes.gerarNumeroSolicitacao();

    const criada = await this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitacoes_servico.create({
        data: { ...dados, numero, status: StatusSolicitacaoServico.REGISTRADA },
        select: { id: true, numero: true },
      });
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
            planta_id: planta.id,
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
