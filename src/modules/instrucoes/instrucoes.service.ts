// src/modules/instrucoes/instrucoes.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PermissionScopeService, PrismaService, ScopedUser } from '@/core';
import { equipamentoNasPlantas } from '@/core/modules/auth/planta-dos-equipamentos';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';
import {
  CreateInstrucaoDto,
  UpdateInstrucaoDto,
  QueryInstrucoesDto,
  UpdateStatusInstrucaoDto,
  InstrucaoResponseDto,
  DashboardInstrucoesDto,
} from './dto';
import { StatusTarefa, Prisma } from '@/core';
import type {
  anomalias_instrucoes,
  instrucao_maquinarios,
  instrucao_recursos,
  instrucoes,
  maquinarios,
  recursos,
  solicitacoes_instrucoes,
  sub_instrucoes,
} from '@prisma/client';
import { passoParaGravar, passoParaResposta } from './passos-da-instrucao';
import { linhasDeMaquinario, linhasDeRecurso } from './linhas-da-instrucao';
import { itemDoMaquinario, itemDoRecurso, linhaDoMaquinario, linhaDoRecurso, porGrupo, somar } from './custo-da-instrucao';
import { variantesDeIds } from '../tarefas/ids';
import { centavos } from '../recursos/regras-do-recurso';

/**
 * Instrucao como as consultas deste service a leem. As relacoes e contadores
 * dependem do include de cada rota, por isso sao opcionais.
 */
type InstrucaoLida = instrucoes & {
  usuario_criador?: InstrucaoResponseDto['usuario_criador'] | null;
  usuario_atualizador?: InstrucaoResponseDto['usuario_atualizador'] | null;
  sub_instrucoes?: sub_instrucoes[];
  recursos?: (instrucao_recursos & { recurso: recursos })[];
  maquinarios?: (instrucao_maquinarios & { maquinario: maquinarios })[];
  anexos?: InstrucaoResponseDto['anexos'];
  _count?: { sub_instrucoes?: number; recursos?: number; maquinarios?: number; anexos?: number; tarefas?: number };
  _tarefas_derivadas?: number;
};

const numero = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

@Injectable()
export class InstrucoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propagacaoService: PropagacaoPlanosService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  /** `autorId`: quem está logado (o controller lê do token), nunca o corpo */
  async criar(createDto: CreateInstrucaoDto, autorId?: string | null): Promise<InstrucaoResponseDto> {
    // Sem código, o próximo INST-NNN; com ele, não pode ser de outra instrução
    const codigo = createDto.codigo?.trim() || (await this.gerarCodigo());
    if (createDto.codigo?.trim()) await this.verificarCodigoUnico(codigo);

    const instrucao = await this.prisma.$transaction(async (tx) => {
      const novaInstrucao = await tx.instrucoes.create({
        data: {
          codigo,
          nome: createDto.nome,
          descricao: createDto.descricao?.trim() || null,
          frente: createDto.frente ?? null,
          prazo_inicio_relativo: createDto.prazo_inicio_relativo ?? 0,
          duracao_dias: createDto.duracao_dias ?? 1,
          observacoes: createDto.observacoes,
          status: createDto.status || StatusTarefa.ATIVA,
          ativo: createDto.ativo !== undefined ? createDto.ativo : true,
          criado_por: autorId?.trim() || null
        }
      });

      if (createDto.sub_instrucoes?.length) {
        await tx.sub_instrucoes.createMany({
          data: createDto.sub_instrucoes.map((sub, index) => passoParaGravar(sub, novaInstrucao.id, index))
        });
      }
      await this.gravarLinhas(tx, novaInstrucao.id, createDto, false);

      return novaInstrucao;
    });

    return this.buscarPorId(instrucao.id);
  }

  /**
   * Troca as listas de recursos e de maquinários que vieram (a que não veio
   * fica). As linhas são resolvidas ANTES de apagar as antigas: o recurso
   * removido do catálogo que a instrução já usava continua valendo.
   */
  private async gravarLinhas(tx: Prisma.TransactionClient, instrucaoId: string, dto: UpdateInstrucaoDto, substituir: boolean) {
    if (dto.recursos) {
      const linhas = await linhasDeRecurso(tx, substituir ? instrucaoId : null, dto.recursos);
      if (substituir) await tx.instrucao_recursos.deleteMany({ where: { instrucao_id: { in: variantesDeIds([instrucaoId]) } } });
      if (linhas.length) await tx.instrucao_recursos.createMany({ data: linhas.map((l) => ({ instrucao_id: instrucaoId, ...l })) });
    }
    if (dto.maquinarios) {
      const linhas = await linhasDeMaquinario(tx, substituir ? instrucaoId : null, dto.maquinarios);
      if (substituir) await tx.instrucao_maquinarios.deleteMany({ where: { instrucao_id: instrucaoId.trim() } });
      if (linhas.length) await tx.instrucao_maquinarios.createMany({ data: linhas.map((l) => ({ instrucao_id: instrucaoId.trim(), ...l })) });
    }
  }

  async listar(queryDto: QueryInstrucoesDto): Promise<{
    data: InstrucaoResponseDto[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const { page, limit, search, sort_by, sort_order, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    const where: Prisma.instrucoesWhereInput = {
      deleted_at: null,
      ...this.construirFiltros(filters, search)
    };

    const orderBy = this.construirOrdenacao(sort_by, sort_order);

    const [instrucoes, total] = await Promise.all([
      this.prisma.instrucoes.findMany({
        where,
        include: this.includeRelacionamentosLista(),
        orderBy,
        skip,
        take: limit
      }),
      this.prisma.instrucoes.count({ where })
    ]);

    return {
      data: instrucoes.map(inst => this.mapearParaResponse(inst)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async buscarPorId(id: string): Promise<InstrucaoResponseDto> {
    // As listas por consulta própria e pelas variantes do id: as FKs dos filhos
    // são Char(26) e instrucoes.id VarChar, e o include volta vazio para id de 25
    const doId = { in: variantesDeIds([id]) };
    const [instrucao, sub_instrucoes, recursos, maquinarios, anexos, totalTarefas] = await Promise.all([
      this.prisma.instrucoes.findFirst({
        where: { id, deleted_at: null },
        include: {
          usuario_criador: {
            select: { id: true, nome: true, email: true }
          },
          usuario_atualizador: {
            select: { id: true, nome: true, email: true }
          }
        }
      }),
      this.prisma.sub_instrucoes.findMany({
        where: { instrucao_id: doId },
        orderBy: { ordem: 'asc' }
      }),
      // O cadastro vem junto: o preço é lido ao vivo, para que reajustar um
      // custo se reflita nas instruções que o usam. O que congela é a OS.
      this.prisma.instrucao_recursos.findMany({
        where: { instrucao_id: doId },
        include: { recurso: true },
        orderBy: [{ recurso: { nome: 'asc' } }, { id: 'asc' }]
      }),
      this.prisma.instrucao_maquinarios.findMany({
        where: { instrucao_id: id.trim() },
        include: { maquinario: true },
        orderBy: [{ maquinario: { nome: 'asc' } }, { id: 'asc' }]
      }),
      this.prisma.anexos_instrucao.findMany({
        where: { instrucao_id: doId },
        orderBy: { created_at: 'desc' }
      }),
      this.prisma.tarefas.count({
        where: { instrucao_id: id, deleted_at: null }
      })
    ]);

    if (!instrucao) {
      throw new NotFoundException('Instrução não encontrada');
    }

    const instrucaoCompleta = {
      ...instrucao,
      sub_instrucoes,
      recursos,
      maquinarios,
      anexos,
      _tarefas_derivadas: totalTarefas
    };

    return this.mapearParaResponse(instrucaoCompleta);
  }

  async atualizar(id: string, updateDto: UpdateInstrucaoDto, autorId?: string | null): Promise<InstrucaoResponseDto> {
    const instrucaoExistente = await this.verificarInstrucaoExiste(id);

    const { sub_instrucoes, recursos, maquinarios, codigo: codigoDigitado, descricao, ...dadosAtualizacao } = updateDto;
    // O PartialType deixa passar null (IsOptional), e nestas colunas NOT NULL o Prisma daria 500: null mantém
    for (const campo of ['nome', 'prazo_inicio_relativo', 'duracao_dias', 'status', 'ativo'] as const) {
      if (dadosAtualizacao[campo] === null) delete dadosAtualizacao[campo];
    }

    // Código trocado: não pode ser de outra instrução. Vazio mantém o gravado
    const codigo = codigoDigitado?.trim() || undefined;
    if (codigo && codigo !== instrucaoExistente.codigo) {
      await this.verificarCodigoUnico(codigo, id);
    }

    const instrucao = await this.prisma.$transaction(async (tx) => {
      const instrucaoAtualizada = await tx.instrucoes.update({
        where: { id },
        data: {
          ...dadosAtualizacao,
          ...(codigo ? { codigo } : {}),
          ...(descricao !== undefined ? { descricao: descricao?.trim() || null } : {}),
          ...(autorId ? { atualizado_por: autorId.trim() } : {}),
          updated_at: new Date()
        }
      });

      // Vindo, a lista inteira é trocada
      if (sub_instrucoes) {
        await tx.sub_instrucoes.deleteMany({ where: { instrucao_id: { in: variantesDeIds([id]) } } });

        if (sub_instrucoes.length > 0) {
          await tx.sub_instrucoes.createMany({
            data: sub_instrucoes.map((sub, index) => passoParaGravar(sub, id, index))
          });
        }
      }
      await this.gravarLinhas(tx, id, { recursos, maquinarios }, true);

      return instrucaoAtualizada;
    });

    return this.buscarPorId(instrucao.id);
  }

  async atualizarStatus(id: string, updateStatusDto: UpdateStatusInstrucaoDto, autorId?: string | null): Promise<InstrucaoResponseDto> {
    await this.verificarInstrucaoExiste(id);

    const instrucao = await this.prisma.instrucoes.update({
      where: { id },
      data: {
        status: updateStatusDto.status,
        ativo: updateStatusDto.status === StatusTarefa.ATIVA,
        ...(autorId ? { atualizado_por: autorId.trim() } : {}),
        updated_at: new Date()
      }
    });

    return this.buscarPorId(instrucao.id);
  }

  async remover(id: string): Promise<void> {
    await this.verificarInstrucaoExiste(id);

    await this.prisma.instrucoes.update({
      where: { id },
      data: { deleted_at: new Date() }
    });
  }

  // ==========================================
  // Tarefas derivadas
  // ==========================================

  async listarTarefasDerivadas(instrucaoId: string, user?: ScopedUser) {
    await this.verificarInstrucaoExiste(instrucaoId);

    // A tarefa da cópia é de um equipamento, e o equipamento é de uma planta:
    // quem tem escopo vê as do escopo e as dos templates (sem equipamento nem
    // planta). Antes a lista vinha de todas as plantas (SN-40).
    const scope = await this.scopeService.getScope(user);
    const where: Prisma.tarefasWhereInput = { instrucao_id: instrucaoId, deleted_at: null };
    if (this.scopeService.isScoped(scope)) {
      where.OR = [
        { equipamento_id: null, planta_id: null },
        { planta_id: { in: scope } },
        { planta_id: null, equipamento: equipamentoNasPlantas(scope) },
      ];
    }

    const tarefas = await this.prisma.tarefas.findMany({
      where,
      include: {
        plano_manutencao: {
          select: { id: true, nome: true, versao: true }
        },
        equipamento: {
          select: { id: true, nome: true, tipo_equipamento: true, classificacao: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return tarefas;
  }

  // ==========================================
  // Associações com anomalias
  // ==========================================

  // O autor sai do token (`user`), não do corpo: antes quem chamava escolhia em
  // nome de quem a associação ficava gravada (SN-40).
  async associarAnomalia(instrucaoId: string, anomaliaId: string, observacoes?: string, user?: ScopedUser): Promise<anomalias_instrucoes> {
    await this.verificarInstrucaoExiste(instrucaoId);
    await this.scopeService.assertEntityInScope('anomalia', anomaliaId, user);

    const anomalia = await this.prisma.anomalias.findFirst({
      where: { id: anomaliaId, deleted_at: null }
    });
    if (!anomalia) {
      throw new NotFoundException('Anomalia não encontrada');
    }

    return this.prisma.anomalias_instrucoes.create({
      data: {
        anomalia_id: anomaliaId,
        instrucao_id: instrucaoId,
        observacoes,
        created_by: user?.id?.trim() ?? null
      }
    });
  }

  async listarAnomalias(instrucaoId: string, user?: ScopedUser) {
    await this.verificarInstrucaoExiste(instrucaoId);

    // Só as anomalias do escopo: a planta gravada nela ou, na antiga sem
    // planta, a do equipamento. Antes vinham as de todas as plantas (SN-40).
    const scope = await this.scopeService.getScope(user);
    const where: Prisma.anomalias_instrucoesWhereInput = { instrucao_id: instrucaoId };
    if (this.scopeService.isScoped(scope)) {
      where.anomalia = {
        OR: [{ planta_id: { in: scope } }, { planta_id: null, equipamento: equipamentoNasPlantas(scope) }],
      };
    }

    const associacoes = await this.prisma.anomalias_instrucoes.findMany({
      where,
      include: {
        anomalia: {
          select: {
            id: true,
            descricao: true,
            local: true,
            status: true,
            prioridade: true,
            data: true,
            created_at: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return associacoes;
  }

  async desassociarAnomalia(instrucaoId: string, anomaliaId: string, user?: ScopedUser): Promise<void> {
    await this.scopeService.assertEntityInScope('anomalia', anomaliaId, user);
    const associacao = await this.prisma.anomalias_instrucoes.findFirst({
      where: { instrucao_id: instrucaoId, anomalia_id: anomaliaId }
    });

    if (!associacao) {
      throw new NotFoundException('Associação não encontrada');
    }

    await this.prisma.anomalias_instrucoes.delete({
      where: { id: associacao.id }
    });
  }

  // ==========================================
  // Associações com solicitações de serviço
  // ==========================================

  // O autor sai do token, como na associação com anomalia (SN-40).
  async associarSolicitacao(instrucaoId: string, solicitacaoId: string, observacoes?: string, user?: ScopedUser): Promise<solicitacoes_instrucoes> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const solicitacao = await this.prisma.solicitacoes_servico.findFirst({
      where: { id: solicitacaoId, deleted_at: null }
    });
    if (!solicitacao) {
      throw new NotFoundException('Solicitação de serviço não encontrada');
    }

    return this.prisma.solicitacoes_instrucoes.create({
      data: {
        solicitacao_id: solicitacaoId,
        instrucao_id: instrucaoId,
        observacoes,
        created_by: user?.id?.trim() ?? null
      }
    });
  }

  async listarSolicitacoes(instrucaoId: string, user?: ScopedUser) {
    await this.verificarInstrucaoExiste(instrucaoId);

    // Só as solicitações do escopo (a solicitação sempre tem planta) — SN-40.
    const scope = await this.scopeService.getScope(user);
    const where: Prisma.solicitacoes_instrucoesWhereInput = { instrucao_id: instrucaoId };
    if (this.scopeService.isScoped(scope)) where.solicitacao = { planta_id: { in: scope } };

    const associacoes = await this.prisma.solicitacoes_instrucoes.findMany({
      where,
      include: {
        solicitacao: {
          select: {
            id: true,
            numero: true,
            titulo: true,
            status: true,
            prioridade: true,
            tipo: true,
            created_at: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return associacoes;
  }

  async desassociarSolicitacao(instrucaoId: string, solicitacaoId: string): Promise<void> {
    const associacao = await this.prisma.solicitacoes_instrucoes.findFirst({
      where: { instrucao_id: instrucaoId, solicitacao_id: solicitacaoId }
    });

    if (!associacao) {
      throw new NotFoundException('Associação não encontrada');
    }

    await this.prisma.solicitacoes_instrucoes.delete({
      where: { id: associacao.id }
    });
  }

  // ==========================================
  // Dashboard
  // ==========================================

  async obterDashboard(): Promise<DashboardInstrucoesDto> {
    const viva = { instrucao: { deleted_at: null, ativo: true } };
    const [statusStats, totalSubInstrucoes, totalRecursos, totalMaquinarios, totalTarefasDerivadas] = await Promise.all([
      this.prisma.instrucoes.groupBy({
        by: ['status'],
        where: { deleted_at: null },
        _count: true
      }),
      this.prisma.sub_instrucoes.count({ where: viva }),
      this.prisma.instrucao_recursos.count({ where: viva }),
      this.prisma.instrucao_maquinarios.count({ where: viva }),
      this.prisma.tarefas.count({
        where: {
          instrucao_id: { not: null },
          deleted_at: null
        }
      })
    ]);

    return {
      total_instrucoes: statusStats.reduce((acc, stat) => acc + stat._count, 0),
      instrucoes_ativas: this.contarPorStatus(statusStats, StatusTarefa.ATIVA),
      instrucoes_inativas: this.contarPorStatus(statusStats, StatusTarefa.INATIVA),
      instrucoes_em_revisao: this.contarPorStatus(statusStats, StatusTarefa.EM_REVISAO),
      instrucoes_arquivadas: this.contarPorStatus(statusStats, StatusTarefa.ARQUIVADA),
      total_sub_instrucoes: totalSubInstrucoes,
      total_recursos: totalRecursos,
      total_maquinarios: totalMaquinarios,
      total_tarefas_derivadas: totalTarefasDerivadas
    };
  }

  /** As frentes já usadas, para o formulário sugerir (texto livre: a sugestão segura a grafia) */
  async frentes(): Promise<string[]> {
    const linhas = await this.prisma.instrucoes.findMany({
      where: { deleted_at: null, frente: { not: null } },
      select: { frente: true },
      distinct: ['frente'],
      orderBy: { frente: 'asc' }
    });
    return linhas.map((l) => l.frente).filter((f): f is string => !!f);
  }

  // ==========================================
  // Métodos privados auxiliares
  // ==========================================

  private async verificarInstrucaoExiste(id: string) {
    const instrucao = await this.prisma.instrucoes.findFirst({
      where: { id, deleted_at: null }
    });

    if (!instrucao) {
      throw new NotFoundException('Instrução não encontrada');
    }

    return instrucao;
  }

  /**
   * O índice único do código vale para TODAS as instruções, removidas
   * inclusive: conferir só as vivas deixava o código de uma removida passar e o
   * banco recusava com 500.
   */
  private async verificarCodigoUnico(codigo: string, excludeId?: string) {
    const outra = await this.prisma.instrucoes.findFirst({
      where: { codigo, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { deleted_at: true }
    });

    if (outra) {
      throw new ConflictException(
        outra.deleted_at
          ? `O código "${codigo}" é de uma instrução removida: use outro.`
          : `O código "${codigo}" já é de outra instrução.`
      );
    }
  }

  /**
   * Próximo INST-NNN a partir do MAIOR número já usado.
   *
   * Antes derivava da instrução "mais recente" por `created_at desc`. Esse
   * campo tem precisão de SEGUNDO: criando várias instruções no mesmo segundo,
   * a mais recente é arbitrária, o número repetia, a verificação de duplicata
   * batia e o código caía no fallback `INST-<timestamp>` — que foi como
   * apareceram códigos do tipo INST-1786559548512.
   *
   * O maior número não depende de ordenação e não empata.
   */
  private async gerarCodigo(): Promise<string> {
    const linhas = await this.prisma.instrucoes.findMany({ select: { codigo: true } });
    return this.proximoSequencial('INST', linhas.map((l) => l.codigo).filter(Boolean));
  }

  /** Números absurdos vêm dos códigos-timestamp do bug antigo e não devem virar base. */
  private static readonly MAIOR_SEQUENCIAL = 100000;

  private proximoSequencial(prefixo: string, codigos: string[]): string {
    const padrao = new RegExp(`^${prefixo}-(\\d+)$`);

    const maior = codigos.reduce((max, codigo) => {
      const encontrado = codigo.match(padrao);
      if (!encontrado) return max;
      const numero = parseInt(encontrado[1], 10);
      if (!Number.isFinite(numero) || numero > InstrucoesService.MAIOR_SEQUENCIAL) return max;
      return numero > max ? numero : max;
    }, 0);

    return `${prefixo}-${(maior + 1).toString().padStart(3, '0')}`;
  }

  /** Só as contagens: as listas vêm no detalhe. Tipado pelo `satisfies`, e não pelo retorno, para o resultado não ganhar as relações */
  private includeRelacionamentosLista() {
    return {
      _count: {
        select: {
          sub_instrucoes: true,
          recursos: true,
          maquinarios: true,
          anexos: true,
          tarefas: true
        }
      }
    } satisfies Prisma.instrucoesInclude;
  }

  private construirFiltros(filters: Partial<QueryInstrucoesDto>, search?: string): Prisma.instrucoesWhereInput {
    const where: Prisma.instrucoesWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.ativo !== undefined) {
      where.ativo = filters.ativo;
    }

    if (filters.frente?.trim()) {
      where.frente = filters.frente.trim();
    }

    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: 'insensitive' } },
        { nome: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  private construirOrdenacao(sortBy?: string, sortOrder?: 'asc' | 'desc') {
    const orderBy: Prisma.instrucoesOrderByWithRelationInput = {};

    switch (sortBy) {
      // "tag" é o nome antigo do código (SN-85): a ordenação salva no navegador continua valendo
      case 'codigo':
      case 'tag':
        orderBy.codigo = sortOrder;
        break;
      case 'nome':
        orderBy.nome = sortOrder;
        break;
      case 'frente':
        orderBy.frente = sortOrder;
        break;
      case 'updated_at':
        orderBy.updated_at = sortOrder;
        break;
      default:
        orderBy.created_at = sortOrder || 'desc';
    }

    return orderBy;
  }

  private mapearParaResponse(instrucao: InstrucaoLida): InstrucaoResponseDto {
    // O custo aberto de cada linha (custo-da-instrucao.ts): a tela, a planilha e a proposta leem estes números
    const recursos = instrucao.recursos?.map((linha) => ({ linha, custo: linhaDoRecurso(linha) }));
    const maquinarios = instrucao.maquinarios?.map((linha) => ({ linha, custo: linhaDoMaquinario(linha) }));
    const custos = recursos && maquinarios ? [...recursos, ...maquinarios].map((l) => l.custo) : undefined;

    return {
      id: instrucao.id?.trim() || instrucao.id,
      codigo: instrucao.codigo,
      nome: instrucao.nome,
      descricao: instrucao.descricao,
      frente: instrucao.frente,
      prazo_inicio_relativo: instrucao.prazo_inicio_relativo,
      duracao_dias: instrucao.duracao_dias,
      observacoes: instrucao.observacoes,
      status: instrucao.status,
      ativo: instrucao.ativo,
      created_at: instrucao.created_at,
      updated_at: instrucao.updated_at,
      criado_por: instrucao.criado_por,
      atualizado_por: instrucao.atualizado_por,
      usuario_criador: instrucao.usuario_criador,
      usuario_atualizador: instrucao.usuario_atualizador,
      sub_instrucoes: instrucao.sub_instrucoes?.map(passoParaResposta),
      recursos: recursos?.map(({ linha, custo }) => ({
        id: linha.id.trim(),
        recurso_id: linha.recurso_id.trim(),
        recurso: itemDoRecurso(linha.recurso),
        quantidade: Number(linha.quantidade),
        duracao_horas: Number(linha.duracao_horas),
        fator_perda: Number(linha.fator_perda),
        fornecido_pelo_cliente: linha.fornecido_pelo_cliente,
        distancia_km: numero(linha.distancia_km),
        preco_proprio: numero(linha.preco_proprio),
        unidades: custo.unidades,
        preco_base: custo.preco_base,
        preco_cadastro: custo.preco_cadastro,
        subtotal: custo.subtotal,
        created_at: linha.created_at,
        updated_at: linha.updated_at,
      })),
      maquinarios: maquinarios?.map(({ linha, custo }) => ({
        id: linha.id.trim(),
        maquinario_id: linha.maquinario_id.trim(),
        maquinario: itemDoMaquinario(linha.maquinario),
        quantidade: Number(linha.quantidade),
        duracao_horas: Number(linha.duracao_horas),
        distancia_km: numero(linha.distancia_km),
        preco_proprio: numero(linha.preco_proprio),
        unidades: custo.unidades,
        preco_base: custo.preco_base,
        preco_cadastro: custo.preco_cadastro,
        subtotal: custo.subtotal,
        created_at: linha.created_at,
        updated_at: linha.updated_at,
      })),
      anexos: instrucao.anexos,
      ...(custos ? { custo_por_grupo: porGrupo(custos), custo: somar(custos) } : {}),
      ...(instrucao.sub_instrucoes
        ? { horas_dos_passos: centavos(instrucao.sub_instrucoes.reduce((h, p) => h + Number(p.duracao_horas ?? 0), 0)) }
        : {}),
      total_sub_instrucoes: instrucao._count?.sub_instrucoes ?? instrucao.sub_instrucoes?.length ?? 0,
      total_recursos: instrucao._count?.recursos ?? instrucao.recursos?.length ?? 0,
      total_maquinarios: instrucao._count?.maquinarios ?? instrucao.maquinarios?.length ?? 0,
      total_anexos: instrucao._count?.anexos ?? instrucao.anexos?.length ?? 0,
      total_tarefas_derivadas: instrucao._count?.tarefas ?? instrucao._tarefas_derivadas ?? 0
    };
  }

  private contarPorStatus(stats: Array<{ status: StatusTarefa; _count: number }>, status: StatusTarefa): number {
    return stats.find(s => s.status === status)?._count || 0;
  }
}
