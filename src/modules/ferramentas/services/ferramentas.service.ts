// ===============================
// src/modules/ferramentas/services/ferramentas.service.ts
// ===============================
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateFerramentaDto } from '../dto/create-ferramenta.dto';
import { UpdateFerramentaDto } from '../dto/update-ferramenta.dto';
import { QueryFerramentasDto } from '../dto/query-ferramentas.dto';
import { FerramentaEntity } from '../entities/ferramenta.entity';

@Injectable()
export class FerramentasService {
  constructor(private prisma: PrismaService) {}

  async create(createFerramentaDto: CreateFerramentaDto, criadoPor: string): Promise<FerramentaEntity> {
    // Verificar se código patrimonial já existe na organização
    const existingFerramenta = await this.prisma.ferramentas.findFirst({
      where: {
        organizacao_nome: createFerramentaDto.organizacao_nome,
        codigo_patrimonial: createFerramentaDto.codigo_patrimonial,
        deleted_at: null,
      },
    });

    if (existingFerramenta) {
      throw new ConflictException(
        `Código patrimonial ${createFerramentaDto.codigo_patrimonial} já existe nesta organização`
      );
    }

    // Verificar se usuário responsável existe
    const responsavel = await this.prisma.usuarios.findUnique({
      where: { id: createFerramentaDto.responsavel_id },
    });

    if (!responsavel) {
      throw new BadRequestException('Usuário responsável não encontrado');
    }

    // Validar data de calibração se necessário
    if (createFerramentaDto.necessita_calibracao && !createFerramentaDto.proxima_data_calibracao) {
      throw new BadRequestException('Data de calibração é obrigatória quando necessita calibração');
    }

    // Validar data de aquisição não ser futura
    const dataAquisicao = new Date(createFerramentaDto.data_aquisicao);
    if (dataAquisicao > new Date()) {
      throw new BadRequestException('Data de aquisição não pode ser futura');
    }

    const ferramenta = await this.prisma.ferramentas.create({
      data: {
        ...createFerramentaDto,
        data_aquisicao: dataAquisicao,
        proxima_data_calibracao: createFerramentaDto.proxima_data_calibracao 
          ? new Date(createFerramentaDto.proxima_data_calibracao) 
          : null,
        criado_por: criadoPor,
      },
      include: {
        responsavel: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
    });

    return this.addCalculatedFields(ferramenta);
  }

  async findAll(query: QueryFerramentasDto) {
    const { page, limit, search, ...filters } = query;
    const skip = (page - 1) * limit;

    // Construir filtros WHERE
    const where: any = {
      deleted_at: null,
      ...(filters.organizacao_nome && { organizacao_nome: filters.organizacao_nome }),
      ...(filters.fabricante && { fabricante: { contains: filters.fabricante, mode: 'insensitive' } }),
      ...(filters.status && { status: filters.status }),
      ...(filters.necessita_calibracao !== undefined && { necessita_calibracao: filters.necessita_calibracao }),
      ...(filters.responsavel_id && { responsavel_id: filters.responsavel_id }),
    };

    // Busca textual
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { codigo_patrimonial: { contains: search, mode: 'insensitive' } },
        { fabricante: { contains: search, mode: 'insensitive' } },
        { modelo: { contains: search, mode: 'insensitive' } },
        { numero_serie: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filtros de calibração
    if (filters.calibracao_vencida) {
      where.necessita_calibracao = true;
      where.proxima_data_calibracao = {
        lt: new Date(),
      };
    }

    if (filters.calibracao_vencendo) {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() + filters.calibracao_vencendo);
      
      where.necessita_calibracao = true;
      where.proxima_data_calibracao = {
        gte: new Date(),
        lte: dataLimite,
      };
    }

    const [ferramentas, total] = await Promise.all([
      this.prisma.ferramentas.findMany({
        where,
        skip,
        take: limit,
        include: {
          responsavel: {
            select: {
              id: true,
              nome: true,
              email: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.ferramentas.count({ where }),
    ]);

    // Calcular estatísticas
    const estatisticas = await this.calculateStatistics(filters.organizacao_nome);

    return {
      data: ferramentas.map(f => this.addCalculatedFields(f)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrevious: page > 1,
      },
      estatisticas,
    };
  }

  async findOne(id: string): Promise<FerramentaEntity> {
    const ferramenta = await this.prisma.ferramentas.findFirst({
      where: { id, deleted_at: null },
      include: {
        responsavel: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        historico_calibracoes: {
          orderBy: { data_calibracao: 'desc' },
          include: {
            criado_por_usuario: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
        historico_manutencoes: {
          orderBy: { data_inicio: 'desc' },
          include: {
            criado_por_usuario: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
      },
    });

    if (!ferramenta) {
      throw new NotFoundException('Ferramenta não encontrada');
    }

    return this.addCalculatedFields(ferramenta);
  }

  async update(id: string, updateFerramentaDto: UpdateFerramentaDto, atualizadoPor: string): Promise<FerramentaEntity> {
    const ferramenta = await this.findOne(id);

    // Validações similares ao create
    if (updateFerramentaDto.responsavel_id) {
      const responsavel = await this.prisma.usuarios.findUnique({
        where: { id: updateFerramentaDto.responsavel_id },
      });

      if (!responsavel) {
        throw new BadRequestException('Usuário responsável não encontrado');
      }
    }

    if (updateFerramentaDto.necessita_calibracao && !updateFerramentaDto.proxima_data_calibracao) {
      throw new BadRequestException('Data de calibração é obrigatória quando necessita calibração');
    }

    const updatedFerramenta = await this.prisma.ferramentas.update({
      where: { id },
      data: {
        ...updateFerramentaDto,
        ...(updateFerramentaDto.data_aquisicao && {
          data_aquisicao: new Date(updateFerramentaDto.data_aquisicao),
        }),
        ...(updateFerramentaDto.proxima_data_calibracao && {
          proxima_data_calibracao: new Date(updateFerramentaDto.proxima_data_calibracao),
        }),
        atualizado_por: atualizadoPor,
      },
      include: {
        responsavel: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
    });

    return this.addCalculatedFields(updatedFerramenta);
  }

  async remove(id: string, deletadoPor: string): Promise<void> {
    await this.findOne(id); // Verificar se existe

    await this.prisma.ferramentas.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        deleted_by: deletadoPor,
      },
    });
  }

  async getStatistics(organizacaoNome?: string) {
    return this.calculateStatistics(organizacaoNome);
  }

  async getAlertas(organizacaoNome?: string) {
    const where: any = {
      deleted_at: null,
      ...(organizacaoNome && { organizacao_nome: organizacaoNome }),
    };

    const hoje = new Date();
    const em30Dias = new Date();
    em30Dias.setDate(hoje.getDate() + 30);

    const [calibracaoVencida, calibracaoVencendo, manutencaoEmAndamento] = await Promise.all([
      // Calibrações vencidas
      this.prisma.ferramentas.findMany({
        where: {
          ...where,
          necessita_calibracao: true,
          proxima_data_calibracao: { lt: hoje },
        },
        select: {
          id: true,
          nome: true,
          codigo_patrimonial: true,
          proxima_data_calibracao: true,
        },
      }),
      // Calibrações vencendo
      this.prisma.ferramentas.findMany({
        where: {
          ...where,
          necessita_calibracao: true,
          proxima_data_calibracao: {
            gte: hoje,
            lte: em30Dias,
          },
        },
        select: {
          id: true,
          nome: true,
          codigo_patrimonial: true,
          proxima_data_calibracao: true,
        },
      }),
      // Manutenções em andamento
      this.prisma.ferramentas.findMany({
        where: {
          ...where,
          status: 'manutencao',
        },
        include: {
          historico_manutencoes: {
            where: { status_manutencao: 'em_andamento' },
            orderBy: { data_inicio: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    return {
      calibracaoVencida: calibracaoVencida.map(f => ({
        ...f,
        diasVencidos: Math.floor((hoje.getTime() - f.proxima_data_calibracao.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      calibracaoVencendo: calibracaoVencendo.map(f => ({
        ...f,
        diasRestantes: Math.ceil((f.proxima_data_calibracao.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      manutencaoEmAndamento: manutencaoEmAndamento
        .filter(f => f.historico_manutencoes.length > 0)
        .map(f => ({
          id: f.id,
          nome: f.nome,
          codigo_patrimonial: f.codigo_patrimonial,
          diasEmManutencao: Math.floor((hoje.getTime() - f.historico_manutencoes[0].data_inicio.getTime()) / (1000 * 60 * 60 * 24)),
          dataInicio: f.historico_manutencoes[0].data_inicio,
        })),
    };
  }

  private async calculateStatistics(organizacaoNome?: string) {
    const where: any = {
      deleted_at: null,
      ...(organizacaoNome && { organizacao_nome: organizacaoNome }),
    };

    const hoje = new Date();

    const [
      total,
      porStatus,
      necessitamCalibracao,
      calibracaoVencida,
      calibracaoVencendo,
      valorPatrimonial,
    ] = await Promise.all([
      this.prisma.ferramentas.count({ where }),
      this.prisma.ferramentas.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.prisma.ferramentas.count({
        where: { ...where, necessita_calibracao: true },
      }),
      this.prisma.ferramentas.count({
        where: {
          ...where,
          necessita_calibracao: true,
          proxima_data_calibracao: { lt: hoje },
        },
      }),
      this.prisma.ferramentas.count({
        where: {
          ...where,
          necessita_calibracao: true,
          proxima_data_calibracao: {
            gte: hoje,
            lte: new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.ferramentas.aggregate({
        where: { ...where, valor_aquisicao: { not: null } },
        _sum: { valor_aquisicao: true },
        _avg: { valor_aquisicao: true },
      }),
    ]);

    const statusMap = porStatus.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      porStatus: {
        disponivel: statusMap.disponivel || 0,
        em_uso: statusMap.em_uso || 0,
        manutencao: statusMap.manutencao || 0,
        inativo: statusMap.inativo || 0,
      },
      calibracoes: {
        necessitamCalibracao,
        calibracaoOk: necessitamCalibracao - calibracaoVencida - calibracaoVencendo,
        calibracaoVencendo,
        calibracaoVencida,
      },
      valorPatrimonial: {
        total: valorPatrimonial._sum.valor_aquisicao || 0,
        media: valorPatrimonial._avg.valor_aquisicao || 0,
      },
    };
  }

  private addCalculatedFields(ferramenta: any): FerramentaEntity {
    let diasParaVencimentoCalibracao: number | null = null;
    let statusCalibracao: 'ok' | 'vencendo' | 'vencida' | 'sem_data' | 'nao_necessita' = 'nao_necessita';

    if (ferramenta.necessita_calibracao) {
      if (ferramenta.proxima_data_calibracao) {
        const hoje = new Date();
        const proximaCalibracao = new Date(ferramenta.proxima_data_calibracao);
        diasParaVencimentoCalibracao = Math.ceil(
          (proximaCalibracao.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diasParaVencimentoCalibracao < 0) {
          statusCalibracao = 'vencida';
        } else if (diasParaVencimentoCalibracao <= 30) {
          statusCalibracao = 'vencendo';
        } else {
          statusCalibracao = 'ok';
        }
      } else {
        statusCalibracao = 'sem_data';
      }
    }

    return {
      ...ferramenta,
      diasParaVencimentoCalibracao,
      statusCalibracao,
      historicoCalibracao: ferramenta.historico_calibracoes,
      historicoManutencao: ferramenta.historico_manutencoes,
    };
  }
}