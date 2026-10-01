import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService, PermissionScopeService, ScopedUser } from '@/core';
import { VeiculosService } from '../veiculos/veiculos.service';
import { StatusReserva, Prisma } from '@/core';
import { camposDaJanela, garantirViaturaLivre, validarJanela, type JanelaDaReserva } from './ocupacao-da-viatura';
import {
  CreateReservaDto,
  UpdateReservaDto,
  QueryReservasDto,
  ReservaResponseDto
} from './dto';


export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ReservasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly veiculosService: VeiculosService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  async criar(createDto: CreateReservaDto, user?: ScopedUser): Promise<ReservaResponseDto> {
    // Verificar se o veículo existe e está disponível (com scope, ja valida planta_id)
    const veiculo = await this.veiculosService.buscarPorId(createDto.veiculoId, user);

    if (!veiculo.ativo) {
      throw new BadRequestException('Veículo não está ativo');
    }

    // "Em uso" não impede reservar outro horário; manutenção/inativa e
    // conflito de horário são checados pela regra única (ocupacao-da-viatura)
    const janela: JanelaDaReserva = {
      data_inicio: createDto.dataInicio,
      data_fim: createDto.dataFim,
      hora_inicio: createDto.horaInicio,
      hora_fim: createDto.horaFim,
    };
    this.recusarNoPassado(janela);

    const reserva = await this.prisma.$transaction(async (tx) => {
      await garantirViaturaLivre(tx, { veiculoId: createDto.veiculoId, janela });
      return tx.reserva_veiculo.create({
      data: {
        veiculo_id: createDto.veiculoId.trim(),
        solicitante_id: createDto.solicitanteId,
        tipo_solicitante: createDto.tipoSolicitante,
        ...camposDaJanela(janela),
        responsavel: createDto.responsavel,
        responsavel_id: createDto.responsavelId,
        finalidade: createDto.finalidade,
        observacoes: createDto.observacoes,
        status: StatusReserva.ativa,
        criado_por: createDto.criadoPor,
        criado_por_id: createDto.criadoPorId
      },
      include: {
        veiculo: {
          select: {
            id: true,
            nome: true,
            placa: true,
            tipo: true,
            capacidade_passageiros: true
          }
        }
      }
      });
    });

    return this.mapearParaResponse(reserva);
  }

  async buscarTodos(queryDto: QueryReservasDto, user?: ScopedUser): Promise<PaginatedResponse<ReservaResponseDto>> {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      veiculoId,
      responsavel,
      tipoSolicitante,
      dataInicio,
      dataFim,
      orderBy,
      orderDirection = 'desc'
    } = queryDto;

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: Prisma.reserva_veiculoWhereInput = {
      ...(search && {
        OR: [
          { responsavel: { contains: search, mode: 'insensitive' } },
          { finalidade: { contains: search, mode: 'insensitive' } },
          { veiculo: { nome: { contains: search, mode: 'insensitive' } } },
          { veiculo: { placa: { contains: search, mode: 'insensitive' } } }
        ]
      }),
      ...(status && { status }),
      ...(veiculoId && { veiculo_id: veiculoId }),
      ...(responsavel && { responsavel: { contains: responsavel, mode: 'insensitive' } }),
      ...(tipoSolicitante && { tipo_solicitante: tipoSolicitante }),
      ...(dataInicio && { data_inicio: { gte: new Date(dataInicio) } }),
      ...(dataFim && { data_fim: { lte: new Date(dataFim) } })
    };

    // Scope RBAC: filtrar reservas via planta_id do veiculo
    const scope = await this.scopeService.getScope(user);
    if (this.scopeService.isScoped(scope)) {
      where.AND = scope.length === 0
        ? [{ id: '__NEVER__' }]
        : [{ veiculo: { planta_id: { in: scope } } }];
    }

    // Ordenação
    const orderByClause = this.buildOrderBy(orderBy, orderDirection);

    // Buscar dados
    const [reservas, total] = await Promise.all([
      this.prisma.reserva_veiculo.findMany({
        where,
        include: {
          veiculo: {
            select: {
              id: true,
              nome: true,
              placa: true,
              tipo: true,
              capacidade_passageiros: true
            }
          }
        },
        orderBy: orderByClause,
        skip,
        take: limit
      }),
      this.prisma.reserva_veiculo.count({ where })
    ]);

    return {
      data: reservas.map(reserva => this.mapearParaResponse(reserva)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async buscarPorId(id: string, user?: ScopedUser): Promise<ReservaResponseDto> {
    const reserva = await this.prisma.reserva_veiculo.findUnique({
      where: { id },
      include: {
        veiculo: {
          select: {
            id: true,
            nome: true,
            placa: true,
            tipo: true,
            capacidade_passageiros: true,
            planta_id: true
          }
        }
      }
    });

    if (!reserva) {
      throw new NotFoundException(`Reserva com ID ${id} não encontrada`);
    }

    // Scope RBAC: 403 se a planta do veiculo nao esta no escopo
    await this.scopeService.assertPlantaInScope((reserva as any).veiculo?.planta_id ?? null, user);

    return this.mapearParaResponse(reserva);
  }

  async atualizar(id: string, updateDto: UpdateReservaDto, user?: ScopedUser): Promise<ReservaResponseDto> {
    const reservaExistente = await this.buscarPorId(id, user);

    if (reservaExistente.status !== StatusReserva.ativa) {
      throw new BadRequestException('Só é possível editar reservas ativas');
    }

    if (updateDto.veiculoId && updateDto.veiculoId !== reservaExistente.veiculoId) {
      await this.veiculosService.buscarPorId(updateDto.veiculoId, user);
    }

    // Trocar viatura, dia ou hora revalida o horário (antes trocar só a
    // viatura não checava conflito nenhum)
    const mudouJanela = Boolean(
      updateDto.veiculoId || updateDto.dataInicio || updateDto.dataFim || updateDto.horaInicio || updateDto.horaFim,
    );
    const janela: JanelaDaReserva = {
      data_inicio: updateDto.dataInicio || reservaExistente.dataInicio,
      data_fim: updateDto.dataFim || reservaExistente.dataFim,
      hora_inicio: updateDto.horaInicio || reservaExistente.horaInicio,
      hora_fim: updateDto.horaFim || reservaExistente.horaFim,
    };

    const reserva = await this.prisma.$transaction(async (tx) => {
      if (mudouJanela) {
        await garantirViaturaLivre(tx, {
          veiculoId: updateDto.veiculoId || reservaExistente.veiculoId,
          janela,
          excluirReservaId: id,
        });
      }
      return tx.reserva_veiculo.update({
      where: { id },
      data: {
        veiculo_id: updateDto.veiculoId?.trim(),
        solicitante_id: updateDto.solicitanteId,
        tipo_solicitante: updateDto.tipoSolicitante,
        ...(mudouJanela ? camposDaJanela(janela) : {}),
        responsavel: updateDto.responsavel,
        responsavel_id: updateDto.responsavelId,
        finalidade: updateDto.finalidade,
        observacoes: updateDto.observacoes
      },
      include: {
        veiculo: {
          select: {
            id: true,
            nome: true,
            placa: true,
            tipo: true,
            capacidade_passageiros: true
          }
        }
      }
      });
    });

    return this.mapearParaResponse(reserva);
  }

  async cancelar(id: string, motivo: string, canceladoPor?: string, canceladoPorId?: string, user?: ScopedUser): Promise<void> {
    await this.buscarPorId(id, user);
    const reserva = await this.buscarPorId(id);

    if (reserva.status !== StatusReserva.ativa) {
      throw new BadRequestException('Só é possível cancelar reservas ativas');
    }

    await this.prisma.reserva_veiculo.update({
      where: { id },
      data: {
        status: StatusReserva.cancelada,
        motivo_cancelamento: motivo,
        data_cancelamento: new Date(),
        cancelado_por: canceladoPor,
        cancelado_por_id: canceladoPorId
      }
    });
  }

  async finalizar(id: string, user?: ScopedUser): Promise<void> {
    await this.buscarPorId(id, user);
    const reserva = await this.buscarPorId(id);

    if (reserva.status !== StatusReserva.ativa) {
      throw new BadRequestException('Só é possível finalizar reservas ativas');
    }

    await this.prisma.reserva_veiculo.update({
      where: { id },
      data: { status: StatusReserva.finalizada, data_finalizacao: new Date() }
    });
  }

  async buscarReservasVeiculo(veiculoId: string, incluirFinalizadas = false, user?: ScopedUser): Promise<ReservaResponseDto[]> {
    // Garantir scope via veiculo (assertEntity vai 403/404)
    if (user) await this.veiculosService.buscarPorId(veiculoId, user);
    const where: Prisma.reserva_veiculoWhereInput = {
      veiculo_id: veiculoId,
      ...(incluirFinalizadas ? {} : { status: { not: StatusReserva.finalizada } })
    };

    const reservas = await this.prisma.reserva_veiculo.findMany({
      where,
      include: {
        veiculo: {
          select: {
            id: true,
            nome: true,
            placa: true,
            tipo: true,
            capacidade_passageiros: true
          }
        }
      },
      orderBy: { data_inicio: 'asc' }
    });

    return reservas.map(reserva => this.mapearParaResponse(reserva));
  }

  /** Reserva que já terminou não faz sentido (a de hoje, ainda em curso, pode) */
  private recusarNoPassado(janela: JanelaDaReserva): void {
    if (validarJanela(janela).fim <= new Date()) {
      throw new BadRequestException('Não é possível criar reservas no passado');
    }
  }

  private buildOrderBy(orderBy?: string, orderDirection?: 'asc' | 'desc') {
    const direction = orderDirection || 'desc';

    switch (orderBy) {
      case 'responsavel':
        return { responsavel: direction };
      case 'dataInicio':
        return { data_inicio: direction };
      case 'dataFim':
        return { data_fim: direction };
      case 'status':
        return { status: direction };
      case 'finalidade':
        return { finalidade: direction };
      case 'criadoEm':
      default:
        return { criado_em: direction };
    }
  }

  private mapearParaResponse(reserva: any): ReservaResponseDto {
    return {
      id: reserva.id,
      veiculoId: reserva.veiculo_id,
      veiculo: reserva.veiculo ? {
        id: reserva.veiculo.id,
        nome: reserva.veiculo.nome,
        placa: reserva.veiculo.placa,
        tipo: reserva.veiculo.tipo,
        capacidadePassageiros: reserva.veiculo.capacidade_passageiros
      } : undefined,
      solicitanteId: reserva.solicitante_id,
      tipoSolicitante: reserva.tipo_solicitante,
      dataInicio: reserva.data_inicio,
      dataFim: reserva.data_fim,
      horaInicio: reserva.hora_inicio,
      horaFim: reserva.hora_fim,
      responsavel: reserva.responsavel,
      responsavelId: reserva.responsavel_id,
      finalidade: reserva.finalidade,
      observacoes: reserva.observacoes,
      status: reserva.status,
      motivoCancelamento: reserva.motivo_cancelamento,
      dataCancelamento: reserva.data_cancelamento,
      canceladoPor: reserva.cancelado_por,
      canceladoPorId: reserva.cancelado_por_id,
      criadoEm: reserva.criado_em,
      atualizadoEm: reserva.atualizado_em,
      criadoPor: reserva.criado_por,
      criadoPorId: reserva.criado_por_id
    };
  }
}