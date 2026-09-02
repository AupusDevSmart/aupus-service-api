// src/modules/instrucoes/instrucoes.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/core';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';
import {
  CreateInstrucaoDto,
  UpdateInstrucaoDto,
  QueryInstrucoesDto,
  UpdateStatusInstrucaoDto,
  InstrucaoResponseDto,
  DashboardInstrucoesDto,
  CreateRecursoInstrucaoDto,
} from './dto';
import { StatusTarefa, Prisma } from '@/core';

@Injectable()
export class InstrucoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propagacaoService: PropagacaoPlanosService,
  ) {}

  async criar(createDto: CreateInstrucaoDto): Promise<InstrucaoResponseDto> {
    // Se não foi fornecida TAG, gerar automaticamente
    if (!createDto.tag) {
      createDto.tag = await this.gerarTagUnica();
    } else {
      await this.verificarTagUnica(createDto.tag);
    }

    // Transação para criar instrução com sub-estruturas
    const instrucao = await this.prisma.$transaction(async (tx) => {
      const novaInstrucao = await tx.instrucoes.create({
        data: {
          tag: createDto.tag,
          nome: createDto.nome,
          descricao: createDto.descricao,
          categoria: createDto.categoria,
          tipo_manutencao: createDto.tipo_manutencao,
          condicao_ativo: createDto.condicao_ativo,
          criticidade: createDto.criticidade,
          duracao_estimada: createDto.duracao_estimada,
          tempo_estimado: createDto.tempo_estimado,
          observacoes: createDto.observacoes,
          status: createDto.status || StatusTarefa.ATIVA,
          ativo: createDto.ativo !== undefined ? createDto.ativo : true,
          criado_por: createDto.criado_por
        }
      });

      // Criar sub-instruções se fornecidas
      if (createDto.sub_instrucoes && createDto.sub_instrucoes.length > 0) {
        await tx.sub_instrucoes.createMany({
          data: createDto.sub_instrucoes.map((sub, index) => ({
            instrucao_id: novaInstrucao.id,
            descricao: sub.descricao,
            obrigatoria: sub.obrigatoria || false,
            tempo_estimado: sub.tempo_estimado,
            ordem: sub.ordem ?? index + 1
          }))
        });
      }

      // Criar recursos se fornecidos
      if (createDto.recursos && createDto.recursos.length > 0) {
        const linhas = await this.montarLinhasDeRecurso(createDto.recursos);
        await tx.recursos_instrucao.createMany({
          data: linhas.map(linha => ({ instrucao_id: novaInstrucao.id, ...linha }))
        });
      }

      return novaInstrucao;
    });

    return this.buscarPorId(instrucao.id);
  }

  /**
   * Resolve as linhas de recurso de uma instrução.
   *
   * Com `recurso_id`, categoria, nome e unidade vêm do catálogo e são copiados
   * para as colunas antigas — que continuam existindo e sendo lidas por quem
   * ainda não migrou. Sem ele, valem os campos digitados.
   *
   * Uma consulta só para todos os ids: resolver um a um dentro do laço faria N
   * idas ao banco dentro da transação de gravação.
   */
  private async montarLinhasDeRecurso(recursos: CreateRecursoInstrucaoDto[]) {
    const ids = [
      ...new Set(
        recursos.map(r => r.recurso_id?.trim()).filter((id): id is string => !!id),
      ),
    ];

    const catalogo = ids.length
      ? await this.prisma.recursos.findMany({
          where: { id: { in: ids }, deleted_at: null },
        })
      : [];

    const porId = new Map(catalogo.map(r => [r.id.trim(), r]));

    return recursos.map((recurso, indice) => {
      const recursoId = recurso.recurso_id?.trim();

      if (recursoId) {
        const doCatalogo = porId.get(recursoId);
        if (!doCatalogo) {
          throw new BadRequestException(
            `O recurso da linha ${indice + 1} não existe mais no catálogo.`,
          );
        }

        return {
          recurso_id: doCatalogo.id,
          tipo: doCatalogo.categoria,
          descricao: doCatalogo.nome,
          unidade: doCatalogo.unidade,
          quantidade: recurso.quantidade,
          obrigatorio: recurso.obrigatorio || false,
        };
      }

      if (!recurso.tipo || !recurso.descricao?.trim()) {
        throw new BadRequestException(`Informe o recurso da linha ${indice + 1}.`);
      }

      return {
        recurso_id: null,
        tipo: recurso.tipo,
        descricao: recurso.descricao.trim(),
        unidade: recurso.unidade,
        quantidade: recurso.quantidade,
        obrigatorio: recurso.obrigatorio || false,
      };
    });
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
    const [instrucao, sub_instrucoes, recursos, anexos, totalTarefas] = await Promise.all([
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
        where: { instrucao_id: id },
        orderBy: { ordem: 'asc' }
      }),
      this.prisma.recursos_instrucao.findMany({
        where: { instrucao_id: id },
        // O catálogo vem junto: preço e unidade são lidos ao vivo, para que
        // reajustar um custo se reflita nas instruções que o usam. O que
        // congela é a OS, no momento em que é gerada.
        include: { recurso: true },
        orderBy: [{ tipo: 'asc' }, { descricao: 'asc' }]
      }),
      this.prisma.anexos_instrucao.findMany({
        where: { instrucao_id: id },
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
      anexos,
      _tarefas_derivadas: totalTarefas
    };

    return this.mapearParaResponse(instrucaoCompleta);
  }

  async atualizar(id: string, updateDto: UpdateInstrucaoDto): Promise<InstrucaoResponseDto> {
    const instrucaoExistente = await this.verificarInstrucaoExiste(id);

    // Se mudou TAG, verificar unicidade
    if (updateDto.tag && updateDto.tag !== instrucaoExistente.tag) {
      await this.verificarTagUnica(updateDto.tag, id);
    }

    const { sub_instrucoes, recursos, ...dadosAtualizacao } = updateDto;

    const instrucao = await this.prisma.$transaction(async (tx) => {
      const instrucaoAtualizada = await tx.instrucoes.update({
        where: { id },
        data: {
          ...dadosAtualizacao,
          updated_at: new Date()
        }
      });

      // Se fornecidas sub-instruções, substituir todas
      if (updateDto.sub_instrucoes) {
        await tx.sub_instrucoes.deleteMany({ where: { instrucao_id: id } });

        if (updateDto.sub_instrucoes.length > 0) {
          await tx.sub_instrucoes.createMany({
            data: updateDto.sub_instrucoes.map((sub, index) => ({
              instrucao_id: id,
              descricao: sub.descricao,
              obrigatoria: sub.obrigatoria || false,
              tempo_estimado: sub.tempo_estimado,
              ordem: sub.ordem ?? index + 1
            }))
          });
        }
      }

      // Se fornecidos recursos, substituir todos
      if (updateDto.recursos) {
        await tx.recursos_instrucao.deleteMany({ where: { instrucao_id: id } });

        if (updateDto.recursos.length > 0) {
          const linhas = await this.montarLinhasDeRecurso(updateDto.recursos);
          await tx.recursos_instrucao.createMany({
            data: linhas.map(linha => ({ instrucao_id: id, ...linha }))
          });
        }
      }

      return instrucaoAtualizada;
    });

    return this.buscarPorId(instrucao.id);
  }

  async atualizarStatus(id: string, updateStatusDto: UpdateStatusInstrucaoDto): Promise<InstrucaoResponseDto> {
    await this.verificarInstrucaoExiste(id);

    const instrucao = await this.prisma.instrucoes.update({
      where: { id },
      data: {
        status: updateStatusDto.status,
        ativo: updateStatusDto.status === StatusTarefa.ATIVA,
        atualizado_por: updateStatusDto.atualizado_por,
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

  async listarTarefasDerivadas(instrucaoId: string): Promise<any[]> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const tarefas = await this.prisma.tarefas.findMany({
      where: {
        instrucao_id: instrucaoId,
        deleted_at: null
      },
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

  async associarAnomalia(instrucaoId: string, anomaliaId: string, observacoes?: string, createdBy?: string): Promise<any> {
    await this.verificarInstrucaoExiste(instrucaoId);

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
        created_by: createdBy
      }
    });
  }

  async listarAnomalias(instrucaoId: string): Promise<any[]> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const associacoes = await this.prisma.anomalias_instrucoes.findMany({
      where: { instrucao_id: instrucaoId },
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

  async desassociarAnomalia(instrucaoId: string, anomaliaId: string): Promise<void> {
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

  async associarSolicitacao(instrucaoId: string, solicitacaoId: string, observacoes?: string, createdBy?: string): Promise<any> {
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
        created_by: createdBy
      }
    });
  }

  async listarSolicitacoes(instrucaoId: string): Promise<any[]> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const associacoes = await this.prisma.solicitacoes_instrucoes.findMany({
      where: { instrucao_id: instrucaoId },
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
    const [statusStats, criticidadeStats, tipoStats, categoriaStats, gerais] = await Promise.all([
      this.prisma.instrucoes.groupBy({
        by: ['status'],
        where: { deleted_at: null },
        _count: true
      }),
      this.prisma.instrucoes.groupBy({
        by: ['criticidade'],
        where: { deleted_at: null, ativo: true },
        _count: true
      }),
      this.prisma.instrucoes.groupBy({
        by: ['tipo_manutencao'],
        where: { deleted_at: null, ativo: true },
        _count: true
      }),
      this.prisma.instrucoes.groupBy({
        by: ['categoria'],
        where: { deleted_at: null, ativo: true },
        _count: true
      }),
      this.prisma.instrucoes.aggregate({
        where: { deleted_at: null, ativo: true },
        _count: true,
        _sum: { tempo_estimado: true },
        _avg: {
          tempo_estimado: true,
          criticidade: true
        }
      })
    ]);

    const [totalSubInstrucoes, totalRecursos, totalTarefasDerivadas] = await Promise.all([
      this.prisma.sub_instrucoes.count({
        where: { instrucao: { deleted_at: null, ativo: true } }
      }),
      this.prisma.recursos_instrucao.count({
        where: { instrucao: { deleted_at: null, ativo: true } }
      }),
      this.prisma.tarefas.count({
        where: {
          instrucao_id: { not: null },
          deleted_at: null
        }
      })
    ]);

    const totalInstrucoes = statusStats.reduce((acc, stat) => acc + stat._count, 0);

    return {
      total_instrucoes: totalInstrucoes,
      instrucoes_ativas: this.contarPorStatus(statusStats, StatusTarefa.ATIVA),
      instrucoes_inativas: this.contarPorStatus(statusStats, StatusTarefa.INATIVA),
      instrucoes_em_revisao: this.contarPorStatus(statusStats, StatusTarefa.EM_REVISAO),
      instrucoes_arquivadas: this.contarPorStatus(statusStats, StatusTarefa.ARQUIVADA),

      criticidade_muito_alta: this.contarPorCriticidade(criticidadeStats, 5),
      criticidade_alta: this.contarPorCriticidade(criticidadeStats, 4),
      criticidade_media: this.contarPorCriticidade(criticidadeStats, 3),
      criticidade_baixa: this.contarPorCriticidade(criticidadeStats, 2),
      criticidade_muito_baixa: this.contarPorCriticidade(criticidadeStats, 1),

      distribuicao_tipos: {
        preventiva: this.contarPorTipo(tipoStats, 'PREVENTIVA'),
        preditiva: this.contarPorTipo(tipoStats, 'PREDITIVA'),
        corretiva: this.contarPorTipo(tipoStats, 'CORRETIVA'),
        inspecao: this.contarPorTipo(tipoStats, 'INSPECAO'),
        visita_tecnica: this.contarPorTipo(tipoStats, 'VISITA_TECNICA')
      },

      distribuicao_categorias: {
        mecanica: this.contarPorCategoria(categoriaStats, 'MECANICA'),
        eletrica: this.contarPorCategoria(categoriaStats, 'ELETRICA'),
        instrumentacao: this.contarPorCategoria(categoriaStats, 'INSTRUMENTACAO'),
        lubrificacao: this.contarPorCategoria(categoriaStats, 'LUBRIFICACAO'),
        limpeza: this.contarPorCategoria(categoriaStats, 'LIMPEZA'),
        inspecao: this.contarPorCategoria(categoriaStats, 'INSPECAO'),
        calibracao: this.contarPorCategoria(categoriaStats, 'CALIBRACAO'),
        outros: this.contarPorCategoria(categoriaStats, 'OUTROS')
      },

      tempo_total_estimado: gerais._sum.tempo_estimado || 0,
      media_tempo_por_instrucao: Math.round(gerais._avg.tempo_estimado || 0),
      media_criticidade: Math.round((gerais._avg.criticidade || 0) * 10) / 10,
      total_sub_instrucoes: totalSubInstrucoes,
      total_recursos: totalRecursos,
      total_tarefas_derivadas: totalTarefasDerivadas
    };
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

  private async verificarTagUnica(tag: string, excludeId?: string) {
    const where: Prisma.instrucoesWhereInput = {
      tag,
      deleted_at: null
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const instrucaoExistente = await this.prisma.instrucoes.findFirst({ where });

    if (instrucaoExistente) {
      throw new ConflictException(`A TAG "${tag}" já está sendo utilizada por outra instrução`);
    }
  }

  /**
   * Próxima TAG a partir do MAIOR número já usado.
   *
   * Antes derivava da instrução "mais recente" por `created_at desc`. Esse
   * campo tem precisão de SEGUNDO: criando várias instruções no mesmo segundo,
   * a mais recente é arbitrária, o número repetia, a verificação de duplicata
   * batia e a tag caía no fallback `INST-<timestamp>` — que foi como
   * apareceram tags do tipo INST-1786559548512.
   *
   * O maior número não depende de ordenação e não empata.
   */
  private async gerarTagUnica(): Promise<string> {
    return this.proximaTagSequencial('INST', await this.tagsExistentes('instrucoes'));
  }

  /** Números absurdos vêm de tags-timestamp do bug antigo e não devem virar base. */
  private static readonly MAIOR_SEQUENCIAL = 100000;

  private async tagsExistentes(modelo: 'instrucoes' | 'tarefas'): Promise<string[]> {
    const linhas = await (this.prisma[modelo] as any).findMany({ select: { tag: true } });
    return linhas.map((l: any) => l.tag).filter(Boolean);
  }

  private proximaTagSequencial(prefixo: string, tags: string[]): string {
    const padrao = new RegExp(`^${prefixo}-(\\d+)$`);

    const maior = tags.reduce((max, tag) => {
      const encontrado = tag.match(padrao);
      if (!encontrado) return max;
      const numero = parseInt(encontrado[1], 10);
      if (!Number.isFinite(numero) || numero > InstrucoesService.MAIOR_SEQUENCIAL) return max;
      return numero > max ? numero : max;
    }, 0);

    return `${prefixo}-${(maior + 1).toString().padStart(3, '0')}`;
  }

  /**
   * `tarefas.tag` é único no banco inteiro, então o maior número tem que ser
   * procurado em todas as tarefas — não só nas do plano. Mesmo motivo do
   * gerador de instrução: `created_at` de segundo empatava e derrubava no
   * fallback com timestamp.
   */
  private async gerarTagTarefa(_planoId: string): Promise<string> {
    return this.proximaTagSequencial('TRF', await this.tagsExistentes('tarefas'));
  }

  private includeRelacionamentosLista(): Prisma.instrucoesInclude {
    return {
      _count: {
        select: {
          sub_instrucoes: true,
          recursos: true,
          anexos: true,
          tarefas: true
        }
      }
    };
  }

  private construirFiltros(filters: Partial<QueryInstrucoesDto>, search?: string): Prisma.instrucoesWhereInput {
    const where: Prisma.instrucoesWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.ativo !== undefined) {
      where.ativo = filters.ativo;
    }

    if (filters.categoria) {
      where.categoria = filters.categoria;
    }

    if (filters.tipo_manutencao) {
      where.tipo_manutencao = filters.tipo_manutencao;
    }

    if (filters.criticidade) {
      where.criticidade = filters.criticidade;
    }

    if (search) {
      where.OR = [
        { tag: { contains: search, mode: 'insensitive' } },
        { nome: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  private construirOrdenacao(sortBy?: string, sortOrder?: 'asc' | 'desc') {
    const orderBy: Prisma.instrucoesOrderByWithRelationInput = {};

    switch (sortBy) {
      case 'tag':
        orderBy.tag = sortOrder;
        break;
      case 'nome':
        orderBy.nome = sortOrder;
        break;
      case 'categoria':
        orderBy.categoria = sortOrder;
        break;
      case 'criticidade':
        orderBy.criticidade = sortOrder;
        break;
      case 'tempo_estimado':
        orderBy.tempo_estimado = sortOrder;
        break;
      case 'updated_at':
        orderBy.updated_at = sortOrder;
        break;
      default:
        orderBy.created_at = sortOrder || 'desc';
    }

    return orderBy;
  }

  private mapearParaResponse(instrucao: any): InstrucaoResponseDto {
    return {
      id: instrucao.id?.trim() || instrucao.id,
      tag: instrucao.tag,
      nome: instrucao.nome,
      descricao: instrucao.descricao,
      categoria: instrucao.categoria,
      tipo_manutencao: instrucao.tipo_manutencao,
      condicao_ativo: instrucao.condicao_ativo,
      criticidade: instrucao.criticidade,
      duracao_estimada: Number(instrucao.duracao_estimada),
      tempo_estimado: instrucao.tempo_estimado,
      observacoes: instrucao.observacoes,
      status: instrucao.status,
      ativo: instrucao.ativo,
      created_at: instrucao.created_at,
      updated_at: instrucao.updated_at,
      criado_por: instrucao.criado_por,
      atualizado_por: instrucao.atualizado_por,
      usuario_criador: instrucao.usuario_criador,
      usuario_atualizador: instrucao.usuario_atualizador,
      sub_instrucoes: instrucao.sub_instrucoes,
      recursos: instrucao.recursos,
      anexos: instrucao.anexos,
      total_sub_instrucoes: instrucao._count?.sub_instrucoes ?? instrucao.sub_instrucoes?.length ?? 0,
      total_recursos: instrucao._count?.recursos ?? instrucao.recursos?.length ?? 0,
      total_anexos: instrucao._count?.anexos ?? instrucao.anexos?.length ?? 0,
      total_tarefas_derivadas: instrucao._count?.tarefas ?? instrucao._tarefas_derivadas ?? 0
    };
  }

  private contarPorStatus(stats: any[], status: StatusTarefa): number {
    return stats.find(s => s.status === status)?._count || 0;
  }

  private contarPorCriticidade(stats: any[], criticidade: number): number {
    return stats.find(s => s.criticidade === criticidade)?._count || 0;
  }

  private contarPorTipo(stats: any[], tipo: string): number {
    return stats.find(s => s.tipo_manutencao === tipo)?._count || 0;
  }

  private contarPorCategoria(stats: any[], categoria: string): number {
    return stats.find(s => s.categoria === categoria)?._count || 0;
  }
}
