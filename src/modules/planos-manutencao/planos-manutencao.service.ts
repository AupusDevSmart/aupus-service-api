// src/modules/planos-manutencao/planos-manutencao.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService, PermissionScopeService, ScopedUser } from '@/core';
import { equipamentoNasPlantas, plantaDeCadaEquipamento } from '@/core/modules/auth/planta-dos-equipamentos';
import {
  CreatePlanoManutencaoDto,
  UpdatePlanoManutencaoDto,
  QueryPlanosDto,
  QueryPlanosPorPlantaDto,
  VincularPlanoDto,
  VincularPlanoResponseDto,
  HerdarPlanoDto,
  HerdarPlanoResponseDto,
  PreviaDesvinculoDto,
  PlanoManutencaoResponseDto,
  PlanoResumoDto,
  DashboardPlanosDto,
  CategoriaResumoDto,
  EquipamentoResumoDto,
  UsuarioResumoDto
} from './dto';
import { Prisma } from '@/core';
import type { equipamentos, planos_manutencao, tarefas } from '@prisma/client';
import { PropagacaoPlanosService } from './propagacao-planos.service';
import { categoriaDoEquipamento } from './categoria-do-equipamento';
import { planoAHerdar, mapearAjustesParaCopia, aplicarDatasHerdadas } from './heranca-de-plano';
import { ancoraDoInicio, primeirosVencimentos } from './primeiros-vencimentos';
import type { PrimeirosVencimentosDto, PrimeirosVencimentosQueryDto } from './dto/primeiros-vencimentos.dto';
import { regraDeDiasUteis } from '../agenda/dias-uteis';

/**
 * Plano como as consultas deste service o leem. As relacoes variam com o
 * include de cada rota, por isso sao todas opcionais.
 */
type PlanoLido = planos_manutencao & {
  categoria?: CategoriaResumoDto | null;
  equipamento?: EquipamentoResumoDto | null;
  usuario_criador?: UsuarioResumoDto | null;
  usuario_atualizador?: UsuarioResumoDto | null;
  tarefas?: Pick<tarefas, 'id' | 'tag' | 'nome' | 'ordem' | 'criticidade' | 'instrucao_id' | 'ativo'>[];
  _count?: { tarefas?: number; copias?: number };
};

/** O "não existe" do plano: também para a cópia de outra planta (SN-57) */
const PLANO_NAO_ENCONTRADO = 'Plano de manutenção não encontrado';

@Injectable()
export class PlanosManutencaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
    private readonly propagacaoService: PropagacaoPlanosService,
  ) {}

  /** Andamento das propagacoes de um template. */
  async consultarPropagacoes(planoId: string, user?: ScopedUser) {
    await this.garantirPlanoNoEscopo(planoId, user);
    return this.propagacaoService.consultar(planoId);
  }

  /**
   * O plano de um equipamento é da planta dele; o template (sem equipamento)
   * vale para toda a base e não tem escopo. Para as rotas por id que liam o
   * plano de qualquer planta (resumo, propagação) — SN-40.
   */
  private async garantirPlanoNoEscopo(id: string, user?: ScopedUser): Promise<void> {
    if (!user) return;
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: { id: id?.trim(), deleted_at: null },
      select: { equipamento_id: true },
    });
    if (!plano) throw new NotFoundException('Plano de manutenção não encontrado');
    // A cópia de outra planta responde como o plano que não existe (SN-57)
    if (plano.equipamento_id) await this.scopeService.assertEntityInScope('equipamento', plano.equipamento_id, user, PLANO_NAO_ENCONTRADO);
  }

  /**
   * Fragmento `where` para planos de equipamento restringindo ao escopo, pela
   * regra única da planta do equipamento (`equipamentoNasPlantas`).
   */
  private async scopeFragment(user?: ScopedUser): Promise<Prisma.planos_manutencaoWhereInput | undefined> {
    const scope = await this.scopeService.getScope(user);
    if (!this.scopeService.isScoped(scope)) return undefined;
    if (scope.length === 0) return { id: '__NEVER__' };
    return { equipamento: equipamentoNasPlantas(scope) };
  }

  /**
   * Template nao tem equipamento, logo nao tem planta, logo nao tem escopo:
   * pertence a uma categoria e vale para toda a base. O escopo por planta e
   * verificado no vinculo, onde o equipamento existe.
   */
  private readonly SOMENTE_TEMPLATES: Prisma.planos_manutencaoWhereInput = {
    plano_origem_id: null,
  };

  async criar(createDto: CreatePlanoManutencaoDto, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
    await this.verificarCategoriaExiste(createDto.categoria_id);

    const dados = {
      ...createDto,
      categoria_id: createDto.categoria_id.trim(),
      versao: createDto.versao || '1.0',
    };

    const plano = await this.prisma.planos_manutencao.create({
      data: dados,
      include: this.includeRelacionamentos()
    });

    return this.mapearParaResponse(plano);
  }

  async listar(queryDto: QueryPlanosDto, user?: ScopedUser): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, search, sort_by, sort_order, vinculados, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // Por padrao, somente templates: as copias por equipamento nascem do
    // vinculo e apareceriam duplicadas aqui, uma por equipamento vinculado.
    //
    // Com `vinculados`, o recorte inverte — sao justamente as copias que
    // interessam a quem programa uma OS, porque a OS e para um ativo e o
    // template nao tem equipamento.
    // A cópia é de um equipamento, e o equipamento é de uma planta: com
    // `vinculados` vale o escopo. Antes não valia, e o técnico e o cliente viam
    // os planos (e os nomes dos equipamentos) das plantas dos outros.
    //
    // Na lista de templates também: "sem origem" traz o plano de equipamento
    // antigo, que nunca teve template, e ele é de uma planta (SN-40). Template
    // de verdade (sem equipamento) segue para todos; sem escopo, nada muda.
    const escopo = await this.scopeFragment(user);
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      ...(vinculados ? { equipamento_id: { not: null } } : this.SOMENTE_TEMPLATES),
      ...this.construirFiltros(filters, search),
      ...(escopo && { AND: [vinculados ? escopo : { OR: [{ equipamento_id: null }, escopo] }] }),
    };

    // Construir ordenação
    const orderBy = this.construirOrdenacao(sort_by, sort_order);

    const [planos, total] = await Promise.all([
      this.prisma.planos_manutencao.findMany({
        where,
        include: {
          equipamento: true,
          categoria: { select: { id: true, nome: true } },
          usuario_criador: {
            select: {
              id: true,
              nome: true,
              email: true
            }
          },
          _count: {
            select: {
              tarefas: {
                where: { deleted_at: null }
              },
              // Quantos equipamentos usam este template hoje
              copias: {
                where: { deleted_at: null }
              }
            }
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      this.prisma.planos_manutencao.count({ where })
    ]);

    if (vinculados) await this.hidratarEquipamentos(planos);

    return {
      data: planos.map(plano => this.mapearParaResponse(plano)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async buscarPorId(id: string, incluirTarefas = false, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
    const includeOptions: Prisma.planos_manutencaoInclude = {
      ...this.includeRelacionamentos(),
      ...(incluirTarefas && {
        tarefas: {
          where: { deleted_at: null },
          orderBy: { ordem: 'asc' }
        }
      })
    };

    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      },
      include: includeOptions
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    // Fora do escopo: 404 como o plano que não existe (SN-57). O template (sem
    // equipamento) é livre: antes dava 404 para o técnico e o cliente, que leem
    // os planos (SN-40).
    if (user && plano.equipamento_id) {
      await this.scopeService.assertEntityInScope('equipamento', plano.equipamento_id, user, PLANO_NAO_ENCONTRADO);
    }

    return this.mapearParaResponse(plano);
  }

  async buscarPorEquipamento(equipamentoId: string, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
    await this.verificarEquipamentoExiste(equipamentoId);
    if (user) await this.scopeService.assertEntityInScope('equipamento', equipamentoId, user);

    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        equipamento_id: equipamentoId,
        deleted_at: null
      },
      include: this.includeRelacionamentos()
    });

    if (!plano) {
      throw new NotFoundException('Este equipamento não possui plano de manutenção');
    }

    return this.mapearParaResponse(plano);
  }

  async buscarPorPlanta(plantaId: string, queryDto: QueryPlanosPorPlantaDto, user?: ScopedUser): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Verificar se planta existe e esta no escopo
    await this.verificarPlantaExiste(plantaId);
    if (user) await this.scopeService.assertPlantaInScope(plantaId, user);

    const { page, limit, incluir_tarefas } = queryDto;
    const skip = (page - 1) * limit;

    // Construir filtros - JOIN entre planos_manutencao e equipamentos através de unidade
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      equipamento: {
        deleted_at: null,
        unidade: {
          planta_id: plantaId
        }
      }
    };

    // Construir include com base nos parâmetros
    const includeOptions: Prisma.planos_manutencaoInclude = {
      equipamento: {
        select: {
          id: true,
          nome: true,
          tipo_equipamento: true,
          classificacao: true,
          unidade: {
            select: {
              planta: {
                select: {
                  id: true,
                  nome: true,
                  localizacao: true
                }
              }
            }
          }
        }
      },
      usuario_criador: {
        select: {
          id: true,
          nome: true,
          email: true
        }
      },
      _count: {
        select: {
          tarefas: {
            where: { deleted_at: null }
          }
        }
      }
    };

    // Incluir tarefas se solicitado
    if (incluir_tarefas) {
      includeOptions.tarefas = {
        where: { deleted_at: null },
        orderBy: { ordem: 'asc' }
      };
    }

    const [planos, total] = await Promise.all([
      this.prisma.planos_manutencao.findMany({
        where,
        include: includeOptions,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      this.prisma.planos_manutencao.count({ where })
    ]);

    return {
      data: planos.map(plano => this.mapearParaResponse(plano)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async buscarPorUnidade(unidadeId: string, queryDto: QueryPlanosPorPlantaDto, user?: ScopedUser): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Verificar se unidade existe e esta no escopo
    await this.verificarUnidadeExiste(unidadeId);
    if (user) await this.scopeService.assertEntityInScope('unidade', unidadeId, user);

    const { page, limit, incluir_tarefas } = queryDto;
    const skip = (page - 1) * limit;

    // Construir filtros - JOIN entre planos_manutencao e equipamentos através de unidade_id
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      equipamento: {
        deleted_at: null,
        unidade_id: unidadeId
      }
    };

    // Construir include com base nos parâmetros
    const includeOptions: Prisma.planos_manutencaoInclude = {
      equipamento: {
        select: {
          id: true,
          nome: true,
          tipo_equipamento: true,
          classificacao: true,
          unidade: {
            select: {
              id: true,
              nome: true,
              planta: {
                select: {
                  id: true,
                  nome: true,
                  localizacao: true
                }
              }
            }
          }
        }
      },
      usuario_criador: {
        select: {
          id: true,
          nome: true,
          email: true
        }
      },
      _count: {
        select: {
          tarefas: {
            where: { deleted_at: null }
          }
        }
      }
    };

    // Incluir tarefas se solicitado
    if (incluir_tarefas) {
      includeOptions.tarefas = {
        where: { deleted_at: null },
        orderBy: { ordem: 'asc' }
      };
    }

    const [planos, total] = await Promise.all([
      this.prisma.planos_manutencao.findMany({
        where,
        include: includeOptions,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      this.prisma.planos_manutencao.count({ where })
    ]);

    return {
      data: planos.map(plano => this.mapearParaResponse(plano)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async atualizar(id: string, updateDto: UpdatePlanoManutencaoDto, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
    const existente = await this.verificarPlanoExiste(id);

    // Copia (tem origem) segue amarrada a um equipamento e mantem o escopo por
    // planta. Template e global por categoria e nao tem escopo.
    if (user && existente.equipamento_id) {
      await this.scopeService.assertEntityInScope('equipamento', existente.equipamento_id, user, PLANO_NAO_ENCONTRADO);
    }

    if (updateDto.categoria_id) {
      await this.verificarCategoriaExiste(updateDto.categoria_id);
    }

    const dadosAtualizacao: Prisma.planos_manutencaoUncheckedUpdateInput = {
      ...updateDto,
      updated_at: new Date()
    };

    const plano = await this.prisma.planos_manutencao.update({
      where: { id },
      data: dadosAtualizacao,
      include: this.includeRelacionamentos()
    });

    // Enfileirado DEPOIS do update: o worker le o template do banco, entao
    // enfileirar antes abre janela para ele propagar o conteudo antigo.
    if (!existente.plano_origem_id) {
      await this.propagacaoService.enfileirar(id);
    }

    return this.mapearParaResponse(plano);
  }

  async remover(id: string, user?: ScopedUser): Promise<void> {
    if (user) {
      const existing = await this.prisma.planos_manutencao.findFirst({
        where: { id, deleted_at: null },
        select: { equipamento_id: true },
      });
      // Como no atualizar: só a cópia tem escopo. O template sem equipamento caía
      // no "id vazio" e dava 404 a quem tem escopo
      if (existing?.equipamento_id) {
        await this.scopeService.assertEntityInScope('equipamento', existing.equipamento_id, user, PLANO_NAO_ENCONTRADO);
      }
    }
    await this.verificarPlanoExiste(id);

    // Soft delete - também marca tarefas como removidas
    await this.prisma.$transaction(async (tx) => {
      // Remover tarefas do plano
      await tx.tarefas.updateMany({
        where: { plano_manutencao_id: id },
        data: { deleted_at: new Date() }
      });

      // Remover plano
      await tx.planos_manutencao.update({
        where: { id },
        data: { deleted_at: new Date() }
      });
    });
  }

  async obterResumo(id: string, user?: ScopedUser): Promise<PlanoResumoDto> {
    await this.garantirPlanoNoEscopo(id, user);
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: { 
        id,
        deleted_at: null 
      },
      include: {
        equipamento: {
          include: {
            unidade: {
              select: {
                planta: {
                  select: {
                    id: true,
                    nome: true
                  }
                }
              }
            }
          }
        },
        tarefas: {
          where: { deleted_at: null },
        }
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    // Calcular estatísticas
    const totalTarefas = plano.tarefas.length;
    const tarefasAtivas = plano.tarefas.filter(t => t.ativo).length;

    const resumo: PlanoResumoDto = {
      id: plano.id,
      nome: plano.nome,
      versao: plano.versao,
      equipamento_nome: plano.equipamento?.nome,
      equipamento_tipo: plano.equipamento?.tipo_equipamento,
      planta_nome: plano.equipamento?.unidade?.planta?.nome,
      total_tarefas: totalTarefas,
      tarefas_ativas: tarefasAtivas,
      created_at: plano.created_at,
      updated_at: plano.updated_at
    };

    return resumo;
  }

  async obterDashboard(): Promise<DashboardPlanosDto> {
    const [totalPlanos, statsTarefas] = await Promise.all([
      // Total de planos
      this.prisma.planos_manutencao.count({
        where: { deleted_at: null }
      }),

      // Stats das tarefas
      this.prisma.tarefas.aggregate({
        where: { deleted_at: null },
        _count: true
      })
    ]);

    const equipamentosComPlano = await this.prisma.planos_manutencao.groupBy({
      by: ['equipamento_id'],
      where: { deleted_at: null }
    }).then(result => result.length);

    return {
      total_planos: totalPlanos,
      equipamentos_com_plano: equipamentosComPlano,
      total_tarefas_todos_planos: statsTarefas._count,
      media_tarefas_por_plano: totalPlanos > 0 ? Math.round(statsTarefas._count / totalPlanos) : 0
    };
  }

  // ==========================================
  // Vinculo equipamento <-> plano (copia do template)
  // ==========================================

  /**
   * Lista os templates aplicaveis a um equipamento: os da categoria do modelo
   * dele. Equipamento sem modelo nao tem categoria e portanto nao tem template.
   */
  /**
   * Os templates de uma categoria, direto.
   *
   * No cadastro de equipamento ainda nao ha id para consultar por equipamento,
   * mas a categoria ja foi escolhida no formulario — e e ela que decide quais
   * planos servem.
   */
  async listarTemplatesDaCategoria(categoriaId: string): Promise<PlanoManutencaoResponseDto[]> {
    const id = categoriaId?.trim();
    if (!id) return [];
    return this.buscarTemplatesPorCategoria(id);
  }

  private async buscarTemplatesPorCategoria(categoriaId: string): Promise<PlanoManutencaoResponseDto[]> {
    const planos = await this.prisma.planos_manutencao.findMany({
      where: { deleted_at: null, ...this.SOMENTE_TEMPLATES, categoria_id: categoriaId },
      include: {
        categoria: { select: { id: true, nome: true } },
        _count: { select: { tarefas: { where: { deleted_at: null } } } }
      },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }]
    });

    return planos.map(plano => this.mapearParaResponse(plano));
  }

  async listarTemplatesDoEquipamento(equipamentoId: string, user?: ScopedUser): Promise<PlanoManutencaoResponseDto[]> {
    const id = equipamentoId.trim();
    if (user) await this.scopeService.assertEntityInScope('equipamento', id, user);

    const categoriaId = await this.categoriaDoEquipamento(id);
    if (!categoriaId) return [];

    return this.buscarTemplatesPorCategoria(categoriaId);
  }

  /** O que se perde ao trocar ou desvincular o plano do equipamento. */
  async previaDesvinculo(equipamentoId: string, user?: ScopedUser): Promise<PreviaDesvinculoDto> {
    const id = equipamentoId.trim();
    if (user) await this.scopeService.assertEntityInScope('equipamento', id, user);

    const copia = await this.prisma.planos_manutencao.findFirst({
      where: { equipamento_id: id, deleted_at: null },
      include: { tarefas: { where: { deleted_at: null }, select: { origem_status: true } } }
    });

    if (!copia) {
      return { possui_plano: false, total_tarefas: 0, tarefas_proprias: 0, tarefas_customizadas: 0 };
    }

    return {
      possui_plano: true,
      total_tarefas: copia.tarefas.length,
      tarefas_proprias: copia.tarefas.filter(t => t.origem_status === 'PROPRIA').length,
      tarefas_customizadas: copia.tarefas.filter(t => t.origem_status === 'CUSTOMIZADA').length
    };
  }

  /**
   * Herda para o equipamento novo o plano que o ocupante anterior da posicao tinha.
   *
   * Copiar e ajustar as datas e uma operacao so porque as tarefas da copia nova
   * so passam a existir depois da copia — o cliente nao teria como mandar os ids
   * num segundo passo. Ele manda as datas pelas tarefas do equipamento ANTIGO,
   * que sao as que a tela mostrou, e o mapeamento acontece aqui.
   */
  async herdarPlano(dto: HerdarPlanoDto, user?: ScopedUser): Promise<HerdarPlanoResponseDto> {
    // A posicao antes de ler o ocupante dela: a resposta diferente contava que a
    // posicao de outra planta existia e tinha plano (revisao do SN-75), e o GET
    // plano-a-herdar ja conferia
    if (user) await this.scopeService.assertEntityInScope('ativo_funcional', dto.ativo_funcional_id, user);
    const heranca = await planoAHerdar(this.prisma, dto.ativo_funcional_id);
    if (!heranca?.template_id) {
      throw new NotFoundException(
        'Esta posicao nao tem ocupante anterior com plano para herdar',
      );
    }

    const vinculo = await this.vincularEquipamento(
      {
        equipamento_id: dto.equipamento_id,
        plano_id: heranca.template_id,
        criado_por: dto.criado_por,
      },
      user,
    );

    // Sem ajustes o plano entra zerado. E o padrao seguro: data herdada errada
    // produz vencimento errado sem ninguem perceber, enquanto tarefa sem data
    // aparece como pendente de definicao.
    const ajustes = (dto.ajustes ?? []).map(a => ({
      tarefa_id: a.tarefa_id,
      data_ultima_execucao: a.data_ultima_execucao ? new Date(a.data_ultima_execucao) : null,
    }));

    const traduzidos = await mapearAjustesParaCopia(this.prisma, dto.equipamento_id, ajustes);
    const datas_aplicadas = await aplicarDatasHerdadas(this.prisma, dto.equipamento_id, traduzidos);

    return {
      plano_id: vinculo.plano_id,
      tarefas_copiadas: vinculo.tarefas_copiadas,
      datas_aplicadas,
    };
  }

  /**
   * O primeiro vencimento de cada tarefa se o vínculo começar na data dada
   * (SN-53), antes de confirmar. Com equipamento, as mesmas checagens do
   * vínculo e os dias úteis da planta dele; sem (no cadastro), só o vencimento.
   */
  async primeirosVencimentosDoVinculo(planoId: string, dto: PrimeirosVencimentosQueryDto, user?: ScopedUser): Promise<PrimeirosVencimentosDto> {
    const ancora = ancoraDoInicio(dto.data_inicio);
    if (!dto.equipamento_id?.trim()) {
      const template = await this.templateParaVincular(planoId);
      return { ancora, com_planta: null, tarefas: primeirosVencimentos(template.tarefas, ancora, undefined) };
    }
    const { equipamento, template } = await this.paraVincular(dto.equipamento_id, planoId, user);
    // A mesma planta que o gerador usa: só a da unidade dizia "sem planta" ao UC antigo com planta na coluna
    const planta = (await plantaDeCadaEquipamento(this.prisma, [equipamento.id])).get(equipamento.id.trim()) ?? null;
    const regra = planta ? await regraDeDiasUteis(this.prisma, planta) : undefined;
    return { ancora, com_planta: !!planta, tarefas: primeirosVencimentos(template.tarefas, ancora, regra) };
  }

  /**
   * O template que se vincula, com as tarefas. Não pode ser a cópia de outro
   * equipamento nem o plano antigo de equipamento (sem origem, mas de uma
   * planta): a prévia sem equipamento mostraria as tarefas dele a quem não vê a planta.
   */
  private async templateParaVincular(planoId: string) {
    const template = await this.prisma.planos_manutencao.findFirst({
      where: { id: planoId.trim(), deleted_at: null },
      include: {
        tarefas: {
          where: { deleted_at: null },
          orderBy: { ordem: 'asc' }
        }
      }
    });

    if (!template) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    if (template.plano_origem_id || template.equipamento_id) {
      throw new BadRequestException('Só é possível vincular um plano template, não uma cópia de outro equipamento');
    }
    return template;
  }

  /** O que o vínculo confere: escopo, UC, template, e a categoria do equipamento igual à do plano. */
  private async paraVincular(equipamentoIdPedido: string, planoId: string, user?: ScopedUser) {
    const equipamentoId = equipamentoIdPedido.trim();
    if (user) await this.scopeService.assertEntityInScope('equipamento', equipamentoId, user);

    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id: equipamentoId, deleted_at: null },
      select: {
        id: true,
        nome: true,
        classificacao: true,
        unidade: { select: { planta_id: true } }
      }
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    if (equipamento.classificacao !== 'UC') {
      throw new BadRequestException(
        'Somente equipamentos UC recebem plano de manutenção. Componentes UAR são cobertos pelo plano do equipamento pai.'
      );
    }

    const template = await this.templateParaVincular(planoId);

    const categoriaEquipamento = await this.categoriaDoEquipamento(equipamentoId);
    if (!categoriaEquipamento) {
      throw new BadRequestException(
        'Equipamento sem modelo definido: não há categoria para casar com o plano'
      );
    }

    if (categoriaEquipamento !== template.categoria_id?.trim()) {
      throw new BadRequestException('O plano pertence a outra categoria de equipamento');
    }
    return { equipamento, template };
  }

  async vincularEquipamento(dto: VincularPlanoDto, user?: ScopedUser): Promise<VincularPlanoResponseDto> {
    const equipamentoId = dto.equipamento_id.trim();
    // A data de início vira a âncora (SN-53); sem ela (a herança, a planilha), o instante do vínculo, como antes
    const ancora = dto.data_inicio ? ancoraDoInicio(dto.data_inicio) : new Date();
    const { equipamento, template } = await this.paraVincular(equipamentoId, dto.plano_id, user);

    const previa = await this.previaDesvinculo(equipamentoId);

    const resultado = await this.prisma.$transaction(async (tx) => {
      // Substituicao: remove a copia anterior inteira — nao acumular plano
      // orfao no banco. Seguro porque a OS congela nome, criticidade,
      // periodicidade e instrucao no momento da geracao: perder a tarefa nao
      // apaga mais o registro do que foi pedido.
      if (previa.possui_plano) {
        const copiaAnterior = await tx.planos_manutencao.findFirst({
          where: { equipamento_id: equipamentoId, deleted_at: null },
          select: { id: true }
        });

        if (copiaAnterior) {
          await this.removerCopia(tx, copiaAnterior.id);
        }
      }

      const copia = await tx.planos_manutencao.create({
        data: {
          nome: template.nome,
          descricao: template.descricao,
          versao: template.versao,
          equipamento_id: equipamentoId,
          plano_origem_id: template.id,
          ...(dto.criado_por && { criado_por: dto.criado_por })
        }
      });

      // A numeracao sai de uma vez, dentro da transacao: gerar tag a cada volta
      // lendo o banco por fora nao enxergaria as criadas aqui, e todas sairiam
      // com o mesmo numero.
      let proximoNumeroTag = await this.proximoNumeroDeTag(tx, 'TRF');

      let copiadas = 0;
      for (const tarefaTemplate of template.tarefas) {
        const tag = `TRF-${(proximoNumeroTag++).toString().padStart(3, '0')}`;

        await tx.tarefas.create({
          data: {
            plano_manutencao_id: copia.id,
            equipamento_id: equipamentoId,
            planta_id: equipamento.unidade?.planta_id ?? null,
            tarefa_origem_id: tarefaTemplate.id,
            origem_status: 'HERDADA',
            data_ancora: ancora,
            tag,
            nome: tarefaTemplate.nome,
            frequencia: tarefaTemplate.frequencia,
            frequencia_personalizada: tarefaTemplate.frequencia_personalizada,
            criticidade: tarefaTemplate.criticidade,
            ordem: tarefaTemplate.ordem,
            instrucao_id: tarefaTemplate.instrucao_id,
            ...(dto.criado_por && { criado_por: dto.criado_por })
          }
        });
        copiadas++;
      }

      return { planoId: copia.id, copiadas };
    }, { maxWait: 15000, timeout: 15000 });

    return {
      plano_id: resultado.planoId,
      tarefas_copiadas: resultado.copiadas,
      substituiu_vinculo_anterior: previa.possui_plano,
      tarefas_proprias_descartadas: previa.tarefas_proprias,
      tarefas_customizadas_descartadas: previa.tarefas_customizadas
    };
  }

  async desvincularEquipamento(equipamentoId: string, user?: ScopedUser): Promise<PreviaDesvinculoDto> {
    const id = equipamentoId.trim();
    if (user) await this.scopeService.assertEntityInScope('equipamento', id, user);

    const previa = await this.previaDesvinculo(id);
    if (!previa.possui_plano) {
      throw new NotFoundException('Este equipamento não possui plano de manutenção vinculado');
    }

    const copia = await this.prisma.planos_manutencao.findFirst({
      where: { equipamento_id: id, deleted_at: null },
      select: { id: true }
    });

    await this.prisma.$transaction(async (tx) => {
      await this.removerCopia(tx, copia!.id);
    });

    return previa;
  }

  /**
   * Apaga de vez a copia de um equipamento e suas tarefas.
   *
   * Hard delete e seguro porque a OS congela o conteudo pedido (nome,
   * criticidade, periodicidade e instrucao) no momento em que e gerada:
   * `tarefas_os.tarefa_id` fica so como rastro, e perder a tarefa nao apaga
   * mais o registro do que foi pedido. Antes do congelamento isso destruiria
   * historico em silencio.
   */
  private async removerCopia(tx: Prisma.TransactionClient, planoId: string): Promise<void> {
    // Os vinculos com OS/programacao ficam com tarefa_id nulo (a FK e opcional),
    // preservando o snapshot ja gravado neles.
    await tx.tarefas.deleteMany({ where: { plano_manutencao_id: planoId } });
    await tx.planos_manutencao.delete({ where: { id: planoId } });
  }

  /** Categoria do modelo (tipo_equipamento) do equipamento, ou null. */
  /**
   * Delega para `categoria-do-equipamento.ts`.
   *
   * Saiu daqui para poder ser testada contra o banco sem montar este service
   * inteiro — ele depende de scope e propagacao, que nao tem nada a ver com a
   * pergunta "de qual categoria e este equipamento".
   *
   * A regra tambem mudou: a categoria agora vem da POSICAO quando ela existe, e
   * so cai no modelo do equipamento como fallback.
   */
  private async categoriaDoEquipamento(equipamentoId: string): Promise<string | null> {
    return categoriaDoEquipamento(this.prisma, equipamentoId);
  }

  // Métodos privados auxiliares

  private async verificarEquipamentoExiste(equipamentoId: string): Promise<void> {
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: {
        id: equipamentoId,
        deleted_at: null
      }
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }
  }

  private async verificarPlantaExiste(plantaId: string): Promise<void> {
    const planta = await this.prisma.plantas.findFirst({
      where: {
        id: plantaId,
        deleted_at: null
      }
    });

    if (!planta) {
      throw new NotFoundException('Planta não encontrada');
    }
  }

  private async verificarUnidadeExiste(unidadeId: string): Promise<void> {
    const unidade = await this.prisma.unidades.findFirst({
      where: {
        id: unidadeId,
        deleted_at: null
      }
    });

    if (!unidade) {
      throw new NotFoundException('Unidade não encontrada');
    }
  }

  private async verificarPlanoExiste(id: string) {
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    return plano;
  }

  private async verificarCategoriaExiste(categoriaId: string): Promise<void> {
    const categoria = await this.prisma.categorias_equipamentos.findFirst({
      where: { id: categoriaId.trim() }
    });

    if (!categoria) {
      throw new NotFoundException('Categoria de equipamento não encontrada');
    }
  }

  private includeRelacionamentos(): Prisma.planos_manutencaoInclude {
    return {
      categoria: {
        select: {
          id: true,
          nome: true
        }
      },
      equipamento: {
        select: {
          id: true,
          nome: true,
          tipo_equipamento: true,
          classificacao: true,
          unidade: {
            select: {
              id: true,
              nome: true,
              planta: {
                select: {
                  id: true,
                  nome: true,
                  localizacao: true
                }
              }
            }
          }
        }
      },
      usuario_criador: {
        select: {
          id: true,
          nome: true,
          email: true
        }
      },
      usuario_atualizador: {
        select: {
          id: true,
          nome: true,
          email: true
        }
      }
    };
  }

  /**
   * Preenche `equipamento` (com unidade e planta) nos planos, comparando ids
   * SEM o padding.
   *
   * A causa raiz que motivou este metodo — `equipamentos.id` em `char(26)`
   * contra `planos_manutencao.equipamento_id` em `varchar`, fazendo o include
   * nativo do Prisma comparar `'...xpfqi '` com `'...xpfqi'` e devolver
   * `equipamento: null` calado — foi corrigida em 2026-09-03 (ver
   * `prisma/sql/2026-09-02-alinhar-tipo-equipamento-id.sql`); as duas colunas
   * sao `char(26)` agora.
   *
   * O metodo ficou porque continua correto e trocar por include nativo aqui e
   * uma mudanca de comportamento em rota de listagem, que merece teste e commit
   * proprios — nao entrou no escopo do alinhamento de tipo.
   */
  private async hidratarEquipamentos(
    planos: Array<Pick<planos_manutencao, 'equipamento_id'> & { equipamento: equipamentos | null }>,
  ): Promise<void> {
    const ids = [
      ...new Set(
        planos
          .map(p => p.equipamento_id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (ids.length === 0) return;

    const equipamentos = await this.prisma.equipamentos.findMany({
      where: { id: { in: ids }, deleted_at: null },
      include: {
        unidade: { include: { planta: { select: { id: true, nome: true } } } },
        // O componente e o equipamento antigo mostram onde estão por aqui: sem
        // isso, "Ventoinha" vinha de todas as usinas sem dizer de qual
        equipamento_pai: { select: { id: true, nome: true, unidade: { include: { planta: { select: { id: true, nome: true } } } } } },
        planta: { select: { id: true, nome: true } },
      },
    });

    const porId = new Map(equipamentos.map(e => [e.id.trim(), e]));

    for (const plano of planos) {
      const chave = plano.equipamento_id?.trim();
      if (chave) plano.equipamento = porId.get(chave) ?? null;
    }
  }

  private construirFiltros(filters: Partial<QueryPlanosDto>, search?: string): Prisma.planos_manutencaoWhereInput {
    const where: Prisma.planos_manutencaoWhereInput = {};

    if (filters.categoria_id) {
      where.categoria_id = filters.categoria_id.trim();
    }

    if (filters.equipamento_id) {
      where.equipamento_id = filters.equipamento_id;
    }

    // Handle planta_id and unidade_id filters - usando equipamento_id diretamente
    // ao invés de relação (para evitar problemas com relações opcionais)
    if (filters.planta_id || filters.unidade_id) {
      // Precisamos fazer uma subquery ou filtrar depois
      // Por enquanto, vamos deixar sem filtrar por planta/unidade no WHERE
      // e filtrar na aplicação se necessário
    }

    if (search) {
      const contem = { contains: search, mode: 'insensitive' as const };
      // A cópia se distingue pelo equipamento e por onde ele está, que é o que
      // a lista de origem da programação mostra (SN-77): buscando só no nome do
      // plano, "Inversor 3" não achava o plano do Inversor 3
      where.OR = [
        { nome: contem },
        { descricao: contem },
        { equipamento: { nome: contem } },
        { equipamento: { ativo_funcional: { nome: contem } } },
        { equipamento: { unidade: { nome: contem } } },
        { equipamento: { unidade: { planta: { nome: contem } } } },
        // O componente (UAR) é da instalação do UC pai, e o equipamento antigo
        // tem só a coluna da planta — a regra do escopo; e a categoria, que a
        // linha mostra como etiqueta
        { equipamento: { equipamento_pai: { unidade: { nome: contem } } } },
        { equipamento: { equipamento_pai: { unidade: { planta: { nome: contem } } } } },
        { equipamento: { planta: { nome: contem } } },
        { equipamento: { tipo_equipamento: contem } },
      ];
    }

    return where;
  }

  /**
   * Com o id no fim, para desempatar: as cópias de um template têm o mesmo nome,
   * e por OFFSET o Postgres não garante a mesma ordem entre as páginas — planos
   * se repetiam e outros nunca apareciam ao rolar a lista de origem (SN-77).
   */
  private construirOrdenacao(sortBy?: string, sortOrder?: 'asc' | 'desc'): Prisma.planos_manutencaoOrderByWithRelationInput[] {
    const orderBy: Prisma.planos_manutencaoOrderByWithRelationInput = {};

    switch (sortBy) {
      case 'nome':
        orderBy.nome = sortOrder;
        break;
      case 'equipamento':
        // Não podemos ordenar por relação opcional, usar equipamento_id
        orderBy.equipamento_id = sortOrder;
        break;
      case 'updated_at':
        orderBy.updated_at = sortOrder;
        break;
      default:
        orderBy.created_at = sortOrder || 'desc';
    }

    return [orderBy, { id: 'asc' }];
  }

  private mapearParaResponse(plano: PlanoLido): PlanoManutencaoResponseDto {
    return {
      id: plano.id,
      categoria_id: plano.categoria_id?.trim() || plano.categoria_id,
      plano_origem_id: plano.plano_origem_id?.trim() || plano.plano_origem_id,
      categoria: plano.categoria,
      is_template: !plano.plano_origem_id,
      total_equipamentos_vinculados: plano._count?.copias ?? 0,
      equipamento_id: plano.equipamento_id,
      nome: plano.nome,
      descricao: plano.descricao,
      versao: plano.versao,
      criado_por: plano.criado_por,
      atualizado_por: plano.atualizado_por,
      created_at: plano.created_at,
      updated_at: plano.updated_at,
      equipamento: plano.equipamento,
      usuario_criador: plano.usuario_criador,
      usuario_atualizador: plano.usuario_atualizador,
      tarefas: plano.tarefas?.map((tarefa) => ({
        id: tarefa.id,
        tag: tarefa.tag,
        nome: tarefa.nome,
        ordem: tarefa.ordem,
        criticidade: tarefa.criticidade,
        instrucao_id: tarefa.instrucao_id,
      })),
      total_tarefas: plano._count?.tarefas || plano.tarefas?.length || 0,
      tarefas_ativas: plano.tarefas?.filter((t) => t.ativo)?.length || 0,
      criticidade_media: plano.tarefas?.length > 0 ? 
        Math.round(plano.tarefas.reduce((acc: number, t) => acc + t.criticidade, 0) / plano.tarefas.length * 10) / 10 : 
        undefined,
    };
  }

  /**
   * Próximo número livre de TAG, olhando TODAS as tarefas.
   *
   * `tarefas.tag` é único no banco inteiro, mas isto contava só as tarefas
   * daquele plano e usava `total + 1`: o segundo equipamento com a mesma
   * quantidade de tarefas gerava exatamente os mesmos números e batia na
   * constraint. A verificação de duplicata também olhava só o próprio plano,
   * então nunca pegava a colisão — caía no fallback com timestamp, que é de
   * onde vinham TAGs como TRF-1786559551441.
   */
  private async proximoNumeroDeTag(cliente: Prisma.TransactionClient, prefixo: string): Promise<number> {
    const linhas = await cliente.tarefas.findMany({ select: { tag: true } });

    // Números absurdos são resquício das TAGs-timestamp e não servem de base.
    const LIMITE = 100000;

    const maior = linhas.reduce((max: number, { tag }: { tag: string | null }) => {
      if (typeof tag !== 'string' || !tag.startsWith(`${prefixo}-`)) return max;
      const resto = tag.slice(prefixo.length + 1);
      if (!/^\d+$/.test(resto)) return max;
      const numero = parseInt(resto, 10);
      return numero <= LIMITE && numero > max ? numero : max;
    }, 0);

    return maior + 1;
  }
}