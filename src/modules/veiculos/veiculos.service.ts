import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreateVeiculoDto,
  UpdateVeiculoDto,
  QueryVeiculosDto,
  VeiculoResponseDto,
  AlterarStatusVeiculoDto,
  InativarVeiculoDto,
  VeiculosDisponiveisDto
} from './dto';
import { StatusVeiculo, Prisma } from '@prisma/client';

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
export class VeiculosService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(createDto: CreateVeiculoDto): Promise<VeiculoResponseDto> {
    // Verificar se placa já existe
    const placaExistente = await this.prisma.veiculo.findUnique({
      where: { placa: createDto.placa }
    });

    if (placaExistente) {
      throw new ConflictException(`Já existe um veículo com a placa ${createDto.placa}`);
    }

    // Verificar se chassi já existe (se fornecido)
    if (createDto.chassi) {
      const chassiExistente = await this.prisma.veiculo.findUnique({
        where: { chassi: createDto.chassi }
      });

      if (chassiExistente) {
        throw new ConflictException(`Já existe um veículo com o chassi ${createDto.chassi}`);
      }
    }

    // Verificar se código patrimonial já existe (se fornecido)
    if (createDto.codigoPatrimonial) {
      const codigoExistente = await this.prisma.veiculo.findUnique({
        where: { codigo_patrimonial: createDto.codigoPatrimonial }
      });

      if (codigoExistente) {
        throw new ConflictException(`Já existe um veículo com o código patrimonial ${createDto.codigoPatrimonial}`);
      }
    }

    // Criar veículo
    const veiculo = await this.prisma.veiculo.create({
      data: {
        nome: createDto.nome,
        codigo_patrimonial: createDto.codigoPatrimonial,
        placa: createDto.placa,
        marca: createDto.marca,
        modelo: createDto.modelo,
        ano_fabricacao: createDto.anoFabricacao,
        ano_modelo: createDto.anoModelo,
        cor: createDto.cor,
        chassi: createDto.chassi,
        renavam: createDto.renavam,
        tipo: createDto.tipo,
        tipo_combustivel: createDto.tipoCombustivel,
        capacidade_passageiros: createDto.capacidadePassageiros,
        capacidade_carga: createDto.capacidadeCarga,
        autonomia_media: createDto.autonomiaMedia,
        localizacao_atual: createDto.localizacaoAtual,
        valor_aquisicao: createDto.valorAquisicao,
        data_aquisicao: createDto.dataAquisicao,
        responsavel: createDto.responsavel,
        responsavel_id: createDto.responsavelId,
        observacoes: createDto.observacoes,
        foto: createDto.foto,
        planta_id: createDto.plantaId,
        proprietario_id: createDto.proprietarioId,
        quilometragem: createDto.quilometragem || 0,
        proxima_revisao: createDto.proximaRevisao,
        ultima_revisao: createDto.ultimaRevisao,
        status: StatusVeiculo.disponivel,
        ativo: true
      },
      include: {
        _count: {
          select: {
            documentacao: true,
            reservas: true
          }
        }
      }
    });

    return this.mapearParaResponse(veiculo);
  }

  async buscarTodos(queryDto: QueryVeiculosDto): Promise<PaginatedResponse<VeiculoResponseDto>> {
    const { page, limit, search, status, tipo, tipoCombustivel, plantaId, responsavel, ativo, marca, anoFabricacao, capacidadeMinima, apenasDisponiveis, orderBy, orderDirection } = queryDto;

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: Prisma.veiculoWhereInput = {
      ativo: ativo,
      ...(search && {
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { placa: { contains: search, mode: 'insensitive' } },
          { marca: { contains: search, mode: 'insensitive' } },
          { modelo: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(status && { status }),
      ...(tipo && { tipo }),
      ...(tipoCombustivel && { tipo_combustivel: tipoCombustivel }),
      ...(plantaId && { planta_id: plantaId }),
      ...(responsavel && { responsavel: { contains: responsavel, mode: 'insensitive' } }),
      ...(marca && { marca: { contains: marca, mode: 'insensitive' } }),
      ...(anoFabricacao && { ano_fabricacao: anoFabricacao }),
      ...(capacidadeMinima && { capacidade_passageiros: { gte: capacidadeMinima } }),
      ...(apenasDisponiveis && {
        status: StatusVeiculo.disponivel,
        reservas: {
          none: {
            status: 'ativa',
            data_fim: { gte: new Date() }
          }
        }
      })
    };

    // Ordenação
    const orderByClause = this.buildOrderBy(orderBy, orderDirection);

    // Buscar dados
    const [veiculos, total] = await Promise.all([
      this.prisma.veiculo.findMany({
        where,
        include: {
          _count: {
            select: {
              documentacao: true,
              reservas: true
            }
          }
        },
        orderBy: orderByClause,
        skip,
        take: limit
      }),
      this.prisma.veiculo.count({ where })
    ]);

    return {
      data: veiculos.map(veiculo => this.mapearParaResponse(veiculo)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async buscarPorId(id: string): Promise<VeiculoResponseDto> {
    const veiculo = await this.prisma.veiculo.findUnique({
      where: { id },
      include: {
        documentacao: {
          where: { ativo: true },
          orderBy: { data_vencimento: 'asc' },
          take: 10
        },
        reservas: {
          where: {
            OR: [
              { status: 'ativa' },
              {
                AND: [
                  { status: 'ativa' },
                  { data_inicio: { gte: new Date() } },
                  { data_inicio: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } } // próximos 30 dias
                ]
              }
            ]
          },
          orderBy: { data_inicio: 'asc' }
        },
        _count: {
          select: {
            documentacao: true,
            reservas: true
          }
        }
      }
    });

    if (!veiculo) {
      throw new NotFoundException(`Veículo com ID ${id} não encontrado`);
    }

    return this.mapearParaResponse(veiculo);
  }

  async atualizar(id: string, updateDto: UpdateVeiculoDto): Promise<VeiculoResponseDto> {
    const veiculoExistente = await this.prisma.veiculo.findUnique({
      where: { id },
      include: {
        reservas: {
          where: { status: 'ativa' }
        }
      }
    });

    if (!veiculoExistente) {
      throw new NotFoundException(`Veículo com ID ${id} não encontrado`);
    }

    // Verificar se tem reservas ativas antes de alterar campos críticos
    if (veiculoExistente.reservas.length > 0) {
      const camposCriticos = ['placa', 'status', 'ativo'];
      const alterandoCamposCriticos = camposCriticos.some(campo => updateDto[campo] !== undefined);

      if (alterandoCamposCriticos) {
        throw new BadRequestException('Não é possível alterar campos críticos de veículo com reservas ativas');
      }
    }

    // Verificar unicidade da placa se estiver sendo alterada
    if (updateDto.placa && updateDto.placa !== veiculoExistente.placa) {
      const placaExistente = await this.prisma.veiculo.findUnique({
        where: { placa: updateDto.placa }
      });

      if (placaExistente) {
        throw new ConflictException(`Já existe um veículo com a placa ${updateDto.placa}`);
      }
    }

    // Atualizar veículo
    const veiculo = await this.prisma.veiculo.update({
      where: { id },
      data: {
        nome: updateDto.nome,
        codigo_patrimonial: updateDto.codigoPatrimonial,
        placa: updateDto.placa,
        marca: updateDto.marca,
        modelo: updateDto.modelo,
        ano_fabricacao: updateDto.anoFabricacao,
        ano_modelo: updateDto.anoModelo,
        cor: updateDto.cor,
        chassi: updateDto.chassi,
        renavam: updateDto.renavam,
        tipo: updateDto.tipo,
        tipo_combustivel: updateDto.tipoCombustivel,
        capacidade_passageiros: updateDto.capacidadePassageiros,
        capacidade_carga: updateDto.capacidadeCarga,
        autonomia_media: updateDto.autonomiaMedia,
        localizacao_atual: updateDto.localizacaoAtual,
        valor_aquisicao: updateDto.valorAquisicao,
        data_aquisicao: updateDto.dataAquisicao,
        responsavel: updateDto.responsavel,
        responsavel_id: updateDto.responsavelId,
        observacoes: updateDto.observacoes,
        foto: updateDto.foto,
        planta_id: updateDto.plantaId,
        proprietario_id: updateDto.proprietarioId,
        quilometragem: updateDto.quilometragem,
        proxima_revisao: updateDto.proximaRevisao,
        ultima_revisao: updateDto.ultimaRevisao
      },
      include: {
        _count: {
          select: {
            documentacao: true,
            reservas: true
          }
        }
      }
    });

    return this.mapearParaResponse(veiculo);
  }

  async inativar(id: string, inativarDto: InativarVeiculoDto, inativadoPor?: string, inativadoPorId?: string): Promise<void> {
    const veiculo = await this.prisma.veiculo.findUnique({
      where: { id },
      include: {
        reservas: {
          where: { status: 'ativa' }
        }
      }
    });

    if (!veiculo) {
      throw new NotFoundException(`Veículo com ID ${id} não encontrado`);
    }

    if (veiculo.reservas.length > 0) {
      throw new ConflictException('Não é possível inativar veículo com reservas ativas');
    }

    // Cancelar reservas futuras
    await this.prisma.reserva_veiculo.updateMany({
      where: {
        veiculo_id: id,
        status: 'ativa',
        data_inicio: { gt: new Date() }
      },
      data: {
        status: 'cancelada',
        motivo_cancelamento: 'Veículo inativado',
        data_cancelamento: new Date(),
        cancelado_por: inativadoPor,
        cancelado_por_id: inativadoPorId
      }
    });

    // Inativar veículo
    await this.prisma.veiculo.update({
      where: { id },
      data: {
        ativo: false,
        status: StatusVeiculo.inativo,
        motivo_inativacao: inativarDto.motivoInativacao,
        inativado_por: inativadoPorId
      }
    });
  }

  async alterarStatus(id: string, alterarStatusDto: AlterarStatusVeiculoDto, alteradoPor?: string, alteradoPorId?: string): Promise<VeiculoResponseDto> {
    const veiculo = await this.prisma.veiculo.findUnique({
      where: { id },
      include: {
        reservas: {
          where: { status: 'ativa' }
        }
      }
    });

    if (!veiculo) {
      throw new NotFoundException(`Veículo com ID ${id} não encontrado`);
    }

    // Validar transições de status
    this.validarTransicaoStatus(veiculo.status, alterarStatusDto.novoStatus);

    // Se tem reservas ativas, não pode alterar para inativo ou manutenção
    if (veiculo.reservas.length > 0 &&
        (alterarStatusDto.novoStatus === StatusVeiculo.inativo || alterarStatusDto.novoStatus === StatusVeiculo.manutencao)) {
      throw new ConflictException('Não é possível alterar status de veículo com reservas ativas');
    }

    // Atualizar status
    const veiculoAtualizado = await this.prisma.veiculo.update({
      where: { id },
      data: {
        status: alterarStatusDto.novoStatus,
        observacoes: alterarStatusDto.observacoes || veiculo.observacoes
      },
      include: {
        _count: {
          select: {
            documentacao: true,
            reservas: true
          }
        }
      }
    });

    return this.mapearParaResponse(veiculoAtualizado);
  }

  async buscarDisponiveis(queryDto: VeiculosDisponiveisDto): Promise<any> {
    const { dataInicio, dataFim, horaInicio, horaFim, capacidadeMinima, tiposVeiculo, excluirReservaId } = queryDto;

    // Validar período
    if (new Date(dataInicio) > new Date(dataFim)) {
      throw new BadRequestException('Data de início deve ser anterior à data de fim');
    }

    // Buscar veículos disponíveis
    const veiculos = await this.prisma.veiculo.findMany({
      where: {
        ativo: true,
        status: StatusVeiculo.disponivel,
        ...(capacidadeMinima && { capacidade_passageiros: { gte: capacidadeMinima } }),
        ...(tiposVeiculo && { tipo: { in: tiposVeiculo } }),
        NOT: {
          reservas: {
            some: {
              status: 'ativa',
              id: excluirReservaId ? { not: excluirReservaId } : undefined,
              OR: [
                {
                  data_inicio: { lte: new Date(dataFim) },
                  data_fim: { gte: new Date(dataInicio) }
                }
              ]
            }
          }
        }
      },
      include: {
        _count: {
          select: {
            reservas: true
          }
        }
      }
    });

    return {
      veiculos: veiculos.map(veiculo => ({
        id: veiculo.id,
        nome: veiculo.nome,
        placa: veiculo.placa,
        capacidadePassageiros: veiculo.capacidade_passageiros,
        tipo: veiculo.tipo,
        disponivel: true,
        proximaIndisponibilidade: null
      })),
      conflitos: [],
      sugestoes: []
    };
  }

  private validarTransicaoStatus(statusAtual: StatusVeiculo, novoStatus: StatusVeiculo): void {
    const transicoesPermitidas: Record<StatusVeiculo, StatusVeiculo[]> = {
      [StatusVeiculo.disponivel]: [StatusVeiculo.em_uso, StatusVeiculo.manutencao, StatusVeiculo.inativo],
      [StatusVeiculo.em_uso]: [StatusVeiculo.disponivel],
      [StatusVeiculo.manutencao]: [StatusVeiculo.disponivel],
      [StatusVeiculo.inativo]: [StatusVeiculo.disponivel]
    };

    if (!transicoesPermitidas[statusAtual]?.includes(novoStatus)) {
      throw new BadRequestException(`Transição de status de ${statusAtual} para ${novoStatus} não é permitida`);
    }
  }

  private buildOrderBy(orderBy?: string, orderDirection?: 'asc' | 'desc') {
    const direction = orderDirection || 'desc';

    switch (orderBy) {
      case 'nome':
        return { nome: direction };
      case 'placa':
        return { placa: direction };
      case 'marca':
        return { marca: direction };
      case 'modelo':
        return { modelo: direction };
      case 'anoFabricacao':
        return { ano_fabricacao: direction };
      case 'quilometragem':
        return { quilometragem: direction };
      case 'criadoEm':
      default:
        return { criado_em: direction };
    }
  }

  private mapearParaResponse(veiculo: any): VeiculoResponseDto {
    return {
      id: veiculo.id,
      nome: veiculo.nome,
      codigoPatrimonial: veiculo.codigo_patrimonial,
      placa: veiculo.placa,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      anoFabricacao: veiculo.ano_fabricacao,
      anoModelo: veiculo.ano_modelo,
      cor: veiculo.cor,
      chassi: veiculo.chassi,
      renavam: veiculo.renavam,
      tipo: veiculo.tipo,
      tipoCombustivel: veiculo.tipo_combustivel,
      capacidadePassageiros: veiculo.capacidade_passageiros,
      capacidadeCarga: Number(veiculo.capacidade_carga),
      autonomiaMedia: veiculo.autonomia_media ? Number(veiculo.autonomia_media) : undefined,
      status: veiculo.status,
      localizacaoAtual: veiculo.localizacao_atual,
      valorAquisicao: veiculo.valor_aquisicao ? Number(veiculo.valor_aquisicao) : undefined,
      dataAquisicao: veiculo.data_aquisicao,
      quilometragem: veiculo.quilometragem,
      proximaRevisao: veiculo.proxima_revisao,
      ultimaRevisao: veiculo.ultima_revisao,
      responsavel: veiculo.responsavel,
      responsavelId: veiculo.responsavel_id,
      observacoes: veiculo.observacoes,
      foto: veiculo.foto,
      ativo: veiculo.ativo,
      motivoInativacao: veiculo.motivo_inativacao,
      inativadoPor: veiculo.inativado_por,
      plantaId: veiculo.planta_id,
      proprietarioId: veiculo.proprietario_id,
      criadoEm: veiculo.criado_em,
      atualizadoEm: veiculo.atualizado_em,
      _count: veiculo._count,
      disponivel: veiculo.status === StatusVeiculo.disponivel,
      alertasDocumentacao: 0, // Será calculado pelo service de documentação
      documentacao: veiculo.documentacao?.map(doc => ({
        id: doc.id,
        tipo: doc.tipo,
        descricao: doc.descricao,
        dataVencimento: doc.data_vencimento,
        ativo: doc.ativo
      })),
      reservasAtivas: veiculo.reservas?.filter(r => r.status === 'ativa').map(r => ({
        id: r.id,
        dataInicio: r.data_inicio,
        dataFim: r.data_fim,
        horaInicio: r.hora_inicio,
        horaFim: r.hora_fim,
        responsavel: r.responsavel,
        finalidade: r.finalidade,
        status: r.status
      }))
    };
  }
}