// src/anomalias/anomalias.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService, PermissionScopeService, PlantaScope } from '@/core';
import { CreateAnomaliaDto, UpdateAnomaliaDto, AnomaliaFiltersDto, AnomaliaStatsDto } from './dto';
import { Prisma } from '@/core';
import { plantasDosEquipamentos } from '@/core/modules/auth/planta-dos-equipamentos';
import { registrarNotificacao } from '../notificacoes/registrar-notificacao';

export type UserCtx = { id: string; role?: string | null; permissions?: string[] } | undefined;

@Injectable()
export class AnomaliasService {
  private readonly logger = new Logger(AnomaliasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  private async getScope(user?: UserCtx): Promise<PlantaScope> {
    if (!user?.id) {
      this.logger.warn(`[SCOPE] user sem id, sem filtro`);
      return null;
    }
    const scope = await this.scopeService.getPlantasDoUsuario(user.id, user.role);
    this.logger.log(
      `[SCOPE] userId=${user.id} role=${user.role ?? 'null'} -> ${scope === null ? 'SEM FILTRO (admin-like)' : `[${scope.length}] ${JSON.stringify(scope)}`}`,
    );
    return scope;
  }

  /**
   * Retorna filtro where para anomalias restringindo ao escopo de plantas.
   * Combina planta_id direto e equipamento.unidade.planta_id.
   */
  private scopeWhere(scope: PlantaScope): Prisma.anomaliasWhereInput | undefined {
    if (!this.scopeService.isScoped(scope)) return undefined;
    if (scope.length === 0) {
      // Usuario sem plantas vinculadas: nao ve nada
      return { id: '__NEVER__' };
    }
    return {
      OR: [
        { planta_id: { in: scope } },
        { equipamento: { unidade: { planta_id: { in: scope } } } },
      ],
    };
  }

  /**
   * O numero da anomalia: ANO-0000, reiniciando a cada ano.
   *
   * A busca e por prefixo do ano corrente, entao virar o ano zera a serie
   * sozinho. A ordenacao alfabetica serve porque o padding deixa todos do mesmo
   * tamanho: "2026-0010" vem depois de "2026-0009" como texto tambem.
   *
   * As anomalias anteriores a este campo ficam sem numero e sao ignoradas pela
   * contagem — atribuir um agora inventaria historico.
   */
  private async gerarNumero(): Promise<string> {
    const ano = new Date().getFullYear();
    const prefixo = `${ano}-`;

    const ultima = await this.prisma.anomalias.findFirst({
      where: { numero: { startsWith: prefixo } },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });

    let sequencial = 1;
    if (ultima?.numero) {
      const lido = parseInt(ultima.numero.slice(prefixo.length), 10);
      if (Number.isFinite(lido)) sequencial = lido + 1;
    }

    return `${prefixo}${sequencial.toString().padStart(4, '0')}`;
  }

  /**
   * Cria a anomalia, refazendo a tentativa quando o numero colide.
   *
   * Duas criacoes simultaneas leem o mesmo ultimo numero. A coluna e `@unique`,
   * entao a segunda falha (P2002) em vez de duplicar — e sem o retry isso
   * viraria um 500 para quem so clicou em salvar ao mesmo tempo que outra
   * pessoa. Tres tentativas: a colisao exige simultaneidade quase exata.
   */
  async create(createAnomaliaDto: CreateAnomaliaDto, user?: UserCtx) {
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await this.criarUmaVez(createAnomaliaDto, user);
      } catch (erro) {
        const colidiu =
          erro instanceof Prisma.PrismaClientKnownRequestError &&
          erro.code === 'P2002' &&
          String(erro.meta?.target ?? '').includes('numero');

        if (!colidiu || tentativa >= 3) throw erro;
      }
    }
  }

  private async criarUmaVez(createAnomaliaDto: CreateAnomaliaDto, user?: UserCtx) {
    const { localizacao, anexos, instrucoes_ids, ...anomaliaData } = createAnomaliaDto;
    const userId = user?.id;

    // Validar escopo: se usuario tem scope, a planta da anomalia deve estar nele
    const scope = await this.getScope(user);
    const plantaId = await this.plantaDoEquipamento(localizacao?.equipamentoId, scope);

    const data: Prisma.anomaliasCreateInput = {
      ...anomaliaData,
      planta: { connect: { id: plantaId } },
      numero: await this.gerarNumero(),
      local: localizacao.local,
      ativo: localizacao.ativo,
      status: 'REGISTRADA',
      criado_por: userId ? `Usuário ${userId}` : 'Sistema',
      ...(localizacao.equipamentoId && {
        equipamento: { connect: { id: localizacao.equipamentoId } }
      }),
      ...(userId && {
        usuario: { connect: { id: userId } }
      }),
      historico: {
        create: {
          acao: 'Anomalia criada',
          usuario: userId ? `Usuário ${userId}` : 'Sistema',
          observacoes: 'Anomalia registrada no sistema'
        }
      }
    };

    // Registrada avisa quem programa (SN-47): o evento e as instruções gravam
    // junto com a anomalia. Instrução inválida desfaz tudo — antes a anomalia
    // ficava criada (e avisada) com o usuário vendo o erro, e ele criava de novo.
    const anomalia = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.anomalias.create({
      data,
      include: {
        planta: true,
        equipamento: {
          include: {
            unidade: {
              select: {
                id: true,
                nome: true,
                planta_id: true,
                planta: { select: { id: true, nome: true } }
              }
            }
          }
        },
        // Nunca a linha inteira: levava o hash da senha na resposta
        usuario: { select: { id: true, nome: true, email: true } },
        historico: {
          orderBy: { created_at: 'desc' }
        },
        anomalias_instrucoes: {
          include: {
            instrucao: {
              select: { id: true, tag: true, nome: true, status: true, ativo: true }
            }
          },
          orderBy: { created_at: 'desc' }
        }
      }
      });
      if (instrucoes_ids && instrucoes_ids.length > 0) await this.associarInstrucoes(tx, criada.id, instrucoes_ids);
      await registrarNotificacao(tx, { evento: 'anomalia.registrada', entidade: 'anomalia', entidadeId: criada.id, atorId: userId });
      return criada;
    });

    return instrucoes_ids && instrucoes_ids.length > 0 ? this.findOne(anomalia.id) : anomalia;
  }

  async findAll(filters: AnomaliaFiltersDto, user?: UserCtx) {
    const { search, periodo, status, prioridade, origem, planta, unidade, page = 1, limit = 10 } = filters;
    const scope = await this.getScope(user);
    const scopeFilter = this.scopeWhere(scope);

    const where: Prisma.anomaliasWhereInput = {
      deleted_at: null,
      ...(scopeFilter && { AND: [scopeFilter] }),
      ...(search && {
        OR: [
          { descricao: { contains: search, mode: 'insensitive' } },
          { local: { contains: search, mode: 'insensitive' } },
          { ativo: { contains: search, mode: 'insensitive' } },
          { criado_por: { contains: search, mode: 'insensitive' } },
          { id: { contains: search, mode: 'insensitive' } },
          // A planta e a instalação, que a lista de origem da programação
          // mostra e a busca não alcançava (SN-77); a do componente é a do UC pai
          { planta: { nome: { contains: search, mode: 'insensitive' } } },
          { equipamento: { unidade: { nome: { contains: search, mode: 'insensitive' } } } },
          { equipamento: { equipamento_pai: { unidade: { nome: { contains: search, mode: 'insensitive' } } } } },
        ]
      }),
      ...(status && { status }),
      ...(prioridade && { prioridade }),
      ...(origem && { origem }),
      // A planta é gravada na anomalia (a do equipamento, inclusive componente)
      ...(planta && !unidade && { planta_id: planta }),
      // Unidade: a do equipamento ou, no componente (UAR), a do UC pai
      ...(unidade && {
        equipamento: {
          OR: [{ unidade_id: unidade }, { equipamento_pai: { unidade_id: unidade } }],
        },
      }),
      ...(periodo && this.buildPeriodoFilter(periodo))
    };

    this.logger.log(`[findAll] where=${JSON.stringify(where)}`);
    const [data, total] = await Promise.all([
      this.prisma.anomalias.findMany({
        where,
        include: {
          planta: true,
          equipamento: {
          include: {
            unidade: {
              select: {
                id: true,
                nome: true,
                planta_id: true,
                planta: { select: { id: true, nome: true } }
              }
            }
          }
        },
          usuario: { select: { id: true, nome: true, email: true } },
          anomalias_instrucoes: {
            include: {
              instrucao: {
                select: { id: true, tag: true, nome: true, status: true, ativo: true }
              }
            }
          }
        },
        // Desempate pelo id: no mesmo segundo (Timestamp(0)) a ordem entre páginas não é garantida
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.anomalias.count({ where })
    ]);

    this.logger.log(`[findAll] data.length=${data.length} total=${total}`);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * 404/403 do escopo para o que pende da anomalia (os anexos). Os anexos eram
   * listados e baixados por qualquer um com `anomalias.view`, de qualquer
   * planta (SN-40).
   */
  async garantirNoEscopo(id: string, user?: UserCtx): Promise<void> {
    await this.scopeService.assertEntityInScope('anomalia', id, user);
  }

  async findOne(id: string, user?: UserCtx) {
    const scope = await this.getScope(user);
    const scopeFilter = this.scopeWhere(scope);
    const anomalia = await this.prisma.anomalias.findFirst({
      where: { id, deleted_at: null, ...(scopeFilter && { AND: [scopeFilter] }) },
      include: {
        planta: true,
        equipamento: {
          include: {
            unidade: {
              select: {
                id: true,
                nome: true,
                planta_id: true,
                planta: { select: { id: true, nome: true } }
              }
            }
          }
        },
        usuario: { select: { id: true, nome: true, email: true } },
        historico: {
          orderBy: { created_at: 'desc' }
        },
        anomalias_instrucoes: {
          include: {
            instrucao: {
              select: { id: true, tag: true, nome: true, status: true, ativo: true }
            }
          },
          orderBy: { created_at: 'desc' }
        }
      }
    });

    if (!anomalia) {
      throw new NotFoundException('Anomalia não encontrada');
    }

    return anomalia;
  }

  async update(id: string, updateAnomaliaDto: UpdateAnomaliaDto, user?: UserCtx) {
    const anomalia = await this.findOne(id, user);
    const userId = user?.id;

    // Ownership: quem so tem manage_own (sem manage) so edita o que reportou
    this.assertManageOrOwnership(user, anomalia.usuario_id);

    if (anomalia.status !== 'REGISTRADA') {
      throw new ConflictException('Apenas anomalias registradas podem ser editadas');
    }

    const { localizacao, anexos, instrucoes_ids, ...updateData } = updateAnomaliaDto;

    // Trocar o equipamento leva a planta junto (e o escopo confere a nova)
    let plantaNova: string | undefined;
    if (localizacao?.equipamentoId) {
      plantaNova = await this.plantaDoEquipamento(localizacao.equipamentoId, await this.getScope(user));
    }

    const data: Prisma.anomaliasUpdateInput = {
      ...updateData,
      ...(localizacao && {
        local: localizacao.local,
        ativo: localizacao.ativo,
        ...(localizacao.equipamentoId && {
          equipamento: { connect: { id: localizacao.equipamentoId } }
        })
      }),
      ...(plantaNova && { planta: { connect: { id: plantaNova } } }),
      historico: {
        create: {
          acao: 'Anomalia atualizada',
          usuario: userId ? `Usuário ${userId}` : 'Sistema',
          observacoes: 'Dados da anomalia foram modificados',
          status_anterior: anomalia.status,
          status_novo: anomalia.status
        }
      }
    };

    // Numa transação: as instruções eram apagadas antes de conferir as novas, e
    // uma instrução inexistente deixava a anomalia sem nenhuma (achado no SN-47)
    await this.prisma.$transaction(async (tx) => {
      await tx.anomalias.update({
        where: { id },
        data,
      });

      if (instrucoes_ids !== undefined) {
        await tx.anomalias_instrucoes.deleteMany({
          where: { anomalia_id: id },
        });
        if (instrucoes_ids && instrucoes_ids.length > 0) {
          await this.associarInstrucoes(tx, id, instrucoes_ids);
        }
      }
    });

    return this.findOne(id);
  }

  async remove(id: string, user?: UserCtx) {
    const anomalia = await this.findOne(id, user);
    const userId = user?.id;

    // Ownership: quem so tem manage_own (sem manage) so remove o que reportou
    this.assertManageOrOwnership(user, anomalia.usuario_id);

    if (anomalia.status !== 'REGISTRADA') {
      throw new ConflictException('Apenas anomalias registradas podem ser excluídas');
    }

    return this.prisma.anomalias.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        historico: {
          create: {
            acao: 'Anomalia removida',
            usuario: userId ? `Usuário ${userId}` : 'Sistema',
            observacoes: 'Anomalia foi removida do sistema'
          }
        }
      }
    });
  }

  async getStats(user?: UserCtx, periodo?: string): Promise<AnomaliaStatsDto> {
    const scope = await this.getScope(user);
    const scopeFilter = this.scopeWhere(scope);
    const whereBase: Prisma.anomaliasWhereInput = { deleted_at: null, ...(scopeFilter && { AND: [scopeFilter] }) };

    if (periodo) {
      const now = new Date();
      let dataInicio: Date;
      switch (periodo) {
        case '7d': dataInicio = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
        case '30d': dataInicio = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
        case '90d': dataInicio = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
        default: dataInicio = null;
      }
      if (dataInicio) {
        whereBase.created_at = { gte: dataInicio };
      }
    }

    const [total, registradas, programadas, finalizadas, criticas] = await Promise.all([
      this.prisma.anomalias.count({ where: whereBase }),
      this.prisma.anomalias.count({ where: { ...whereBase, status: 'REGISTRADA' } }),
      this.prisma.anomalias.count({ where: { ...whereBase, status: 'PROGRAMADA' } }),
      this.prisma.anomalias.count({ where: { ...whereBase, status: 'FINALIZADA' } }),
      this.prisma.anomalias.count({ where: { ...whereBase, prioridade: 'CRITICA' } }),
    ]);

    return { total, registradas, programadas, finalizadas, criticas };
  }

  /**
   * Quando o usuario nao tem `anomalias.manage`, exige que ele seja o autor da anomalia
   * (anomalias.manage_own). Sem permissions na sessao -> deixa passar (caller ja confiou no guard).
   */
  private assertManageOrOwnership(user: UserCtx, ownerId: string | null | undefined): void {
    const perms = user?.permissions;
    if (!perms) return;
    if (perms.includes('anomalias.manage')) return;
    if (!perms.includes('anomalias.manage_own')) return; // guard ja teria barrado
    const uid = user?.id?.trim();
    if (!uid || ownerId?.trim() !== uid) {
      throw new ForbiddenException('Voce so pode editar anomalias que reportou');
    }
  }

  /**
   * A planta da anomalia é a do equipamento, gravada na anomalia. Antes ela só
   * servia para conferir o escopo e nunca era gravada; e o componente (UAR), que
   * não tem unidade, ficava sem planta. É por ela que o técnico enxerga a
   * anomalia e que a programação dela herda a planta.
   */
  private async plantaDoEquipamento(equipamentoId: string | undefined, scope: PlantaScope): Promise<string> {
    if (!equipamentoId?.trim()) {
      throw new BadRequestException('Informe o equipamento da anomalia: e por ele que a anomalia chega a planta.');
    }
    const [planta] = await plantasDosEquipamentos(this.prisma, [equipamentoId]);
    const escopado = this.scopeService.isScoped(scope);
    // Para quem tem escopo, o equipamento de outra planta, o sem planta e o que
    // não existe respondem igual: status ou texto diferente contava que o id
    // existe (SN-57)
    if (escopado && (!planta || !scope.includes(planta))) throw new NotFoundException('Equipamento não encontrado');
    if (!planta) throw new BadRequestException('O equipamento informado nao existe ou nao esta em nenhuma planta.');
    return planta;
  }

  private buildPeriodoFilter(periodo: string): Prisma.anomaliasWhereInput {
    // Formato esperado: "Janeiro de 2025"
    const [mes, , ano] = periodo.split(' ');
    const meses: Record<string, number> = {
      'Janeiro': 0, 'Fevereiro': 1, 'Março': 2, 'Abril': 3,
      'Maio': 4, 'Junho': 5, 'Julho': 6, 'Agosto': 7,
      'Setembro': 8, 'Outubro': 9, 'Novembro': 10, 'Dezembro': 11
    };

    const mesIndex = meses[mes];
    if (mesIndex === undefined || !ano) return {};

    const startDate = new Date(parseInt(ano), mesIndex, 1);
    const endDate = new Date(parseInt(ano), mesIndex + 1, 0, 23, 59, 59);

    return {
      data: {
        gte: startDate,
        lte: endDate
      }
    };
  }

  async getPlantasSelect(user?: UserCtx) {
    const scope = await this.getScope(user);
    const where: Prisma.plantasWhereInput = { deleted_at: null };
    if (this.scopeService.isScoped(scope)) {
      where.id = { in: scope };
    }
    return this.prisma.plantas.findMany({
      where,
      select: {
        id: true,
        nome: true
      },
      orderBy: { nome: 'asc' }
    });
  }

  async getUnidadesSelect(user?: UserCtx, plantaId?: string) {
    const scope = await this.getScope(user);
    const where: Prisma.unidadesWhereInput = { deleted_at: null };

    if (plantaId) {
      where.planta_id = plantaId;
    }
    if (this.scopeService.isScoped(scope)) {
      where.planta_id = plantaId ? plantaId : { in: scope };
      if (plantaId && !scope.includes(plantaId)) {
        // planta fora do escopo: retorna vazio
        where.planta_id = '__NEVER__';
      }
    }

    return this.prisma.unidades.findMany({
      where,
      select: {
        id: true,
        nome: true,
        planta: {
          select: {
            id: true,
            nome: true
          }
        }
      },
      orderBy: { nome: 'asc' }
    });
  }

  async getEquipamentosSelect(user?: UserCtx, plantaId?: string) {
    const scope = await this.getScope(user);
    const where: Prisma.equipamentosWhereInput = { deleted_at: null };

    if (plantaId) {
      where.unidade = { planta_id: plantaId };
    }
    if (this.scopeService.isScoped(scope)) {
      if (plantaId && !scope.includes(plantaId)) {
        where.unidade = { planta_id: '__NEVER__' };
      } else if (!plantaId) {
        where.unidade = { planta_id: { in: scope } };
      }
    }

    return this.prisma.equipamentos.findMany({
      where,
      select: {
        id: true,
        nome: true,
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
      },
      orderBy: [
        { nome: 'asc' }
      ]
    }).then(equipamentos =>
      equipamentos.map(eq => ({
        id: eq.id,
        nome: eq.nome,
        planta_id: eq.unidade?.planta?.id || null,
        planta_nome: eq.unidade?.planta?.nome || 'Sem planta'
      }))
    );
  }

  async getUsuariosSelect() {
    return this.prisma.usuarios.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        email: true
      },
      orderBy: { nome: 'asc' }
    });
  }

  private async associarInstrucoes(tx: Prisma.TransactionClient, anomaliaId: string, instrucoesIds: string[]) {
    const instrucoes = await tx.instrucoes.findMany({
      where: {
        id: { in: instrucoesIds },
        deleted_at: null
      }
    });

    if (instrucoes.length !== instrucoesIds.length) {
      throw new BadRequestException('Algumas instruções não foram encontradas');
    }

    // Criar associações uma a uma para que o Prisma gere os IDs via @default(cuid())
    for (const instrucaoId of instrucoesIds) {
      await tx.anomalias_instrucoes.create({
        data: {
          anomalia_id: anomaliaId,
          instrucao_id: instrucaoId,
        }
      });
    }
  }
}