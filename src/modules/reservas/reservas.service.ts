import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { VeiculosService } from '../veiculos/veiculos.service';
import { StatusVeiculo, StatusReserva, Prisma } from '@prisma/client';
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
    private readonly veiculosService: VeiculosService
  ) {}

  async criar(createDto: CreateReservaDto): Promise<ReservaResponseDto> {
    // Verificar se o veículo existe e está disponível
    const veiculo = await this.veiculosService.buscarPorId(createDto.veiculoId);

    if (!veiculo.ativo) {
      throw new BadRequestException('Veículo não está ativo');
    }

    if (veiculo.status !== StatusVeiculo.disponivel) {
      throw new BadRequestException('Veículo não está disponível para reserva');
    }

    // Validar período
    this.validarPeriodo(createDto.dataInicio, createDto.dataFim, createDto.horaInicio, createDto.horaFim);

    // Verificar conflitos
    await this.verificarConflitos(createDto.veiculoId, createDto.dataInicio, createDto.dataFim, createDto.horaInicio, createDto.horaFim);

    // Criar reserva
    const reserva = await this.prisma.reserva_veiculo.create({
      data: {
        veiculo_id: createDto.veiculoId,
        solicitante_id: createDto.solicitanteId,
        tipo_solicitante: createDto.tipoSolicitante,
        data_inicio: createDto.dataInicio,
        data_fim: createDto.dataFim,
        hora_inicio: createDto.horaInicio,
        hora_fim: createDto.horaFim,
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

    return this.mapearParaResponse(reserva);
  }

  async buscarTodos(queryDto: QueryReservasDto): Promise<PaginatedResponse<ReservaResponseDto>> {
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

  async buscarPorId(id: string): Promise<ReservaResponseDto> {
    const reserva = await this.prisma.reserva_veiculo.findUnique({
      where: { id },
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

    if (!reserva) {
      throw new NotFoundException(`Reserva com ID ${id} não encontrada`);
    }

    return this.mapearParaResponse(reserva);
  }

  async atualizar(id: string, updateDto: UpdateReservaDto): Promise<ReservaResponseDto> {
    const reservaExistente = await this.buscarPorId(id);

    if (reservaExistente.status !== StatusReserva.ativa) {
      throw new BadRequestException('Só é possível editar reservas ativas');
    }

    // Se está alterando o veículo, verificar se está disponível
    if (updateDto.veiculoId && updateDto.veiculoId !== reservaExistente.veiculoId) {
      const veiculo = await this.veiculosService.buscarPorId(updateDto.veiculoId);

      if (!veiculo.ativo || veiculo.status !== StatusVeiculo.disponivel) {
        throw new BadRequestException('Veículo não está disponível para reserva');
      }
    }

    // Se está alterando período, validar
    if (updateDto.dataInicio || updateDto.dataFim || updateDto.horaInicio || updateDto.horaFim) {
      const dataInicio = updateDto.dataInicio || reservaExistente.dataInicio;
      const dataFim = updateDto.dataFim || reservaExistente.dataFim;
      const horaInicio = updateDto.horaInicio || reservaExistente.horaInicio;
      const horaFim = updateDto.horaFim || reservaExistente.horaFim;

      this.validarPeriodo(dataInicio, dataFim, horaInicio, horaFim);

      // Verificar conflitos (excluindo a própria reserva)
      await this.verificarConflitos(
        updateDto.veiculoId || reservaExistente.veiculoId,
        dataInicio,
        dataFim,
        horaInicio,
        horaFim,
        id
      );
    }

    // Atualizar reserva
    const reserva = await this.prisma.reserva_veiculo.update({
      where: { id },
      data: {
        veiculo_id: updateDto.veiculoId,
        solicitante_id: updateDto.solicitanteId,
        tipo_solicitante: updateDto.tipoSolicitante,
        data_inicio: updateDto.dataInicio,
        data_fim: updateDto.dataFim,
        hora_inicio: updateDto.horaInicio,
        hora_fim: updateDto.horaFim,
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

    return this.mapearParaResponse(reserva);
  }

  async cancelar(id: string, motivo: string, canceladoPor?: string, canceladoPorId?: string): Promise<void> {
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

  async finalizar(id: string): Promise<void> {
    const reserva = await this.buscarPorId(id);

    if (reserva.status !== StatusReserva.ativa) {
      throw new BadRequestException('Só é possível finalizar reservas ativas');
    }

    await this.prisma.reserva_veiculo.update({
      where: { id },
      data: { status: StatusReserva.finalizada }
    });
  }

  async buscarReservasVeiculo(veiculoId: string, incluirFinalizadas = false): Promise<ReservaResponseDto[]> {
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

  private validarPeriodo(dataInicio: Date, dataFim: Date, horaInicio: string, horaFim: string): void {
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);

    if (inicio > fim) {
      throw new BadRequestException('Data de início deve ser anterior à data de fim');
    }

    if (inicio.toDateString() === fim.toDateString() && horaInicio >= horaFim) {
      throw new BadRequestException('Hora de início deve ser anterior à hora de fim no mesmo dia');
    }

    // Não permitir reservas no passado
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (inicio < hoje) {
      throw new BadRequestException('Não é possível criar reservas no passado');
    }
  }

  private async verificarConflitos(
    veiculoId: string,
    dataInicio: Date,
    dataFim: Date,
    horaInicio: string,
    horaFim: string,
    excluirReservaId?: string
  ): Promise<void> {
    const conflitos = await this.prisma.reserva_veiculo.findMany({
      where: {
        veiculo_id: veiculoId,
        status: StatusReserva.ativa,
        ...(excluirReservaId && { id: { not: excluirReservaId } }),
        OR: [
          {
            data_inicio: { lte: dataFim },
            data_fim: { gte: dataInicio }
          }
        ]
      }
    });

    if (conflitos.length > 0) {
      const conflito = conflitos[0];
      throw new ConflictException(
        `Existe conflito com reserva de ${conflito.data_inicio.toLocaleDateString()} a ${conflito.data_fim.toLocaleDateString()}`
      );
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