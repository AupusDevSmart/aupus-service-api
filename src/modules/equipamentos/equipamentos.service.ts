import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateEquipamentoDto } from './dto/create-equipamento.dto';
import { UpdateEquipamentoDto } from './dto/update-equipamento.dto';
import { EquipamentoQueryDto } from './dto/equipamento-query.dto';
import { CreateComponenteUARDto } from './dto/componente-uar.dto';

@Injectable()
export class EquipamentosService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateEquipamentoDto) {
    // Validar se planta existe (para UC) ou equipamento pai existe (para UAR)
    if (createDto.classificacao === 'UC' && !createDto.planta_id) {
      throw new BadRequestException('Equipamento UC deve ter uma planta');
    }

    if (createDto.classificacao === 'UAR' && !createDto.equipamento_pai_id) {
      throw new BadRequestException('Componente UAR deve ter um equipamento pai');
    }

    if (createDto.planta_id) {
      const plantaExists = await this.prisma.plantas.findFirst({
        where: { id: createDto.planta_id, deleted_at: null }
      });
      if (!plantaExists) {
        throw new NotFoundException('Planta não encontrada');
      }
    }

    if (createDto.equipamento_pai_id) {
      const equipamentoPaiExists = await this.prisma.equipamentos.findFirst({
        where: { id: createDto.equipamento_pai_id, deleted_at: null, classificacao: 'UC' }
      });
      if (!equipamentoPaiExists) {
        throw new NotFoundException('Equipamento pai não encontrado ou não é UC');
      }
    }

    // Extrair dados técnicos separadamente
    const { dados_tecnicos, ...equipamentoData } = createDto;

    return await this.prisma.$transaction(async (prisma) => {
      // Criar equipamento
      const equipamento = await prisma.equipamentos.create({
        data: equipamentoData,
        include: {
          planta: {
            select: {
              id: true,
              nome: true,
            },
          },
          proprietario: {
            select: {
              id: true,
              nome: true,
              cpf_cnpj: true,
            },
          },
          equipamento_pai: {
            select: {
              id: true,
              nome: true,
              classificacao: true,
              criticidade: true,
            },
          },
        },
      });

      // Criar dados técnicos se fornecidos
      if (dados_tecnicos && dados_tecnicos.length > 0) {
        await prisma.equipamentos_dados_tecnicos.createMany({
          data: dados_tecnicos.map((dt) => ({
            equipamento_id: equipamento.id,
            ...dt,
          })),
        });
      }

      return equipamento;
    });
  }

  async findAll(query: EquipamentoQueryDto) {
    const { page = 1, limit = 10, search, planta_id, proprietario_id, classificacao, criticidade, equipamento_pai_id, orderBy = 'created_at', orderDirection = 'desc' } = query;
    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {
      deleted_at: null,
    };

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { fabricante: { contains: search, mode: 'insensitive' } },
        { modelo: { contains: search, mode: 'insensitive' } },
        { numero_serie: { contains: search, mode: 'insensitive' } },
        { localizacao: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (planta_id) where.planta_id = planta_id;
    if (proprietario_id) where.proprietario_id = proprietario_id;
    if (classificacao) where.classificacao = classificacao;
    if (criticidade) where.criticidade = criticidade;
    if (equipamento_pai_id) where.equipamento_pai_id = equipamento_pai_id;

    const [data, total] = await Promise.all([
      this.prisma.equipamentos.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderBy]: orderDirection },
        include: {
          planta: {
            select: {
              id: true,
              nome: true,
            },
          },
          proprietario: {
            select: {
              id: true,
              nome: true,
              cpf_cnpj: true,
            },
          },
          equipamento_pai: {
            select: {
              id: true,
              nome: true,
              classificacao: true,
              criticidade: true,
            },
          },
          componentes_uar: {
            select: {
              id: true,
              nome: true,
              classificacao: true,
            },
            where: {
              deleted_at: null,
            },
          },
        },
      }),
      this.prisma.equipamentos.count({ where }),
    ]);

    // Adicionar contagem de componentes
    const dataWithCounts = data.map((equipamento) => ({
      ...equipamento,
      totalComponentes: equipamento.componentes_uar?.length || 0,
    }));

    return {
      data: dataWithCounts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id, deleted_at: null },
      include: {
        planta: true,
        proprietario: {
          select: {
            id: true,
            nome: true,
            cpf_cnpj: true,
          },
        },
        equipamento_pai: {
          select: {
            id: true,
            nome: true,
            classificacao: true,
            criticidade: true,
          },
        },
        componentes_uar: {
          where: { deleted_at: null },
          include: {
            dados_tecnicos: true,
          },
        },
        dados_tecnicos: true,
      },
    });

    console.log('API: Dados técnicos do banco:', equipamento.dados_tecnicos);

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    return {
      ...equipamento,
      totalComponentes: equipamento.componentes_uar?.length || 0,
    };
  }

  async update(id: string, updateDto: UpdateEquipamentoDto) {
    const equipamentoExists = await this.prisma.equipamentos.findFirst({
      where: { id, deleted_at: null },
    });

    if (!equipamentoExists) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    // Extrair dados técnicos separadamente
    const { dados_tecnicos, ...equipamentoData } = updateDto;

    return await this.prisma.$transaction(async (prisma) => {
      // Atualizar equipamento
      const equipamento = await prisma.equipamentos.update({
        where: { id },
        data: equipamentoData,
        include: {
          planta: {
            select: {
              id: true,
              nome: true,
            },
          },
          proprietario: {
            select: {
              id: true,
              nome: true,
              cpf_cnpj: true,
            },
          },
          equipamento_pai: {
            select: {
              id: true,
              nome: true,
              classificacao: true,
              criticidade: true,
            },
          },
        },
      });

      // Atualizar dados técnicos se fornecidos
      if (dados_tecnicos) {
        // Remover dados técnicos existentes
        await prisma.equipamentos_dados_tecnicos.deleteMany({
          where: { equipamento_id: id },
        });

        // Criar novos dados técnicos
        if (dados_tecnicos.length > 0) {
          await prisma.equipamentos_dados_tecnicos.createMany({
            data: dados_tecnicos.map((dt) => ({
              equipamento_id: id,
              ...dt,
            })),
          });
        }
      }

      return equipamento;
    });
  }

  async remove(id: string) {
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id, deleted_at: null },
      include: {
        componentes_uar: {
          where: { deleted_at: null },
        },
      },
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    // Se for UC e tiver componentes, impedir exclusão
    if (equipamento.classificacao === 'UC' && equipamento.componentes_uar.length > 0) {
      throw new BadRequestException('Não é possível excluir equipamento que possui componentes UAR');
    }

    // Soft delete
    await this.prisma.equipamentos.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return { message: 'Equipamento removido com sucesso' };
  }

  async findComponentesByEquipamento(equipamentoId: string) {
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id: equipamentoId, deleted_at: null, classificacao: 'UC' },
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento UC não encontrado');
    }

    return await this.prisma.equipamentos.findMany({
      where: {
        equipamento_pai_id: equipamentoId,
        deleted_at: null,
      },
      include: {
        dados_tecnicos: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findEquipamentosUC() {
    return await this.prisma.equipamentos.findMany({
      where: {
        classificacao: 'UC',
        deleted_at: null,
      },
      select: {
        id: true,
        nome: true,
        fabricante: true,
        modelo: true,
        planta: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
      orderBy: { nome: 'asc' },
    });
  }

  async findUARDetalhes(uarId: string) {
    const uar = await this.prisma.equipamentos.findFirst({
      where: { 
        id: uarId, 
        deleted_at: null, 
        classificacao: 'UAR' 
      },
      include: {
        planta: {
          select: {
            id: true,
            nome: true,
            localizacao: true,
          },
        },
        proprietario: {
          select: {
            id: true,
            nome: true,
            cpf_cnpj: true,
          },
        },
        equipamento_pai: {
          select: {
            id: true,
            nome: true,
            classificacao: true,
            criticidade: true,
            fabricante: true,
            modelo: true,
            localizacao: true,
          },
        },
        dados_tecnicos: {
          orderBy: { campo: 'asc' },
        },
      },
    });

    if (!uar) {
      throw new NotFoundException('Componente UAR não encontrado');
    }

    return uar;
  }

  async findComponentesParaGerenciar(ucId: string) {
    // Verificar se UC existe
    const equipamentoUC = await this.prisma.equipamentos.findFirst({
      where: { id: ucId, deleted_at: null, classificacao: 'UC' },
      select: {
        id: true,
        nome: true,
        fabricante: true,
        modelo: true,
        planta: {
          select: { id: true, nome: true }
        },
        proprietario: {
          select: { id: true, nome: true }
        }
      }
    });

    if (!equipamentoUC) {
      throw new NotFoundException('Equipamento UC não encontrado');
    }

    // Buscar componentes UAR
    const componentes = await this.prisma.equipamentos.findMany({
      where: {
        equipamento_pai_id: ucId,
        deleted_at: null,
      },
      include: {
        dados_tecnicos: {
          orderBy: { campo: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      equipamentoUC,
      componentes,
    };
  }

  async salvarComponentesUARLote(ucId: string, componentes: Partial<CreateEquipamentoDto & { id?: string }>[]) {
    const equipamentoUC = await this.prisma.equipamentos.findFirst({
      where: { id: ucId, deleted_at: null, classificacao: 'UC' }
    });

    if (!equipamentoUC) {
      throw new NotFoundException('Equipamento UC não encontrado');
    }

    const resultados = [];

    for (const componente of componentes) {
      const componenteId = (componente as any).id;
      const { dados_tecnicos, ...componenteData } = componente;
      
      const baseData = {
        nome: componente.nome,
        fabricante: componente.fabricante,
        modelo: componente.modelo,
        numero_serie: componente.numero_serie,
        criticidade: componente.criticidade,
        tipo_equipamento: componente.tipo_equipamento,
        localizacao_especifica: componente.localizacao_especifica,
        classificacao: 'UAR' as const,
        equipamento_pai_id: ucId,
        planta_id: equipamentoUC.planta_id,
        proprietario_id: equipamentoUC.proprietario_id,
      };

      if (componenteId) {
        // Atualizar
        const atualizado = await this.prisma.equipamentos.update({
          where: { id: componenteId },
          data: baseData,
        });
        resultados.push(atualizado);
      } else {
        // Criar
        const criado = await this.prisma.equipamentos.create({
          data: baseData,
        });
        resultados.push(criado);
      }
    }

    return {
      message: `${resultados.length} componentes processados com sucesso`,
      componentes: resultados
    };
  }

  async findByPlanta(plantaId: string, query: EquipamentoQueryDto) {
    // Verificar se planta existe
    const plantaExists = await this.prisma.plantas.findFirst({
      where: { id: plantaId, deleted_at: null }
    });

    if (!plantaExists) {
      throw new NotFoundException('Planta não encontrada');
    }

    // Usar o método findAll existente com filtro de planta
    const queryComPlanta = {
      ...query,
      planta_id: plantaId
    };

    const resultado = await this.findAll(queryComPlanta);

    return {
      ...resultado,
      planta: {
        id: plantaExists.id,
        nome: plantaExists.nome,
        localizacao: plantaExists.localizacao,
      }
    };
  }

  async getEstatisticasPlanta(plantaId: string) {
    // Verificar se planta existe
    const planta = await this.prisma.plantas.findFirst({
      where: { id: plantaId, deleted_at: null }
    });

    if (!planta) {
      throw new NotFoundException('Planta não encontrada');
    }

    const [
      totalEquipamentos,
      equipamentosPorTipo,
      equipamentosPorCriticidade,
      valorTotal,
      equipamentosUC,
      componentesUAR
    ] = await Promise.all([
      // Total de equipamentos
      this.prisma.equipamentos.count({
        where: { planta_id: plantaId, deleted_at: null }
      }),

      // Por tipo
      this.prisma.equipamentos.groupBy({
        by: ['classificacao'],
        where: { planta_id: plantaId, deleted_at: null },
        _count: { id: true }
      }),

      // Por criticidade
      this.prisma.equipamentos.groupBy({
        by: ['criticidade'],
        where: { planta_id: plantaId, deleted_at: null },
        _count: { id: true }
      }),

      // Valor total
      this.prisma.equipamentos.aggregate({
        where: { 
          planta_id: plantaId, 
          deleted_at: null,
          valor_contabil: { not: null }
        },
        _sum: { valor_contabil: true }
      }),

      // Contagem UCs
      this.prisma.equipamentos.count({
        where: { 
          planta_id: plantaId, 
          deleted_at: null, 
          classificacao: 'UC' 
        }
      }),

      // Contagem UARs
      this.prisma.equipamentos.count({
        where: { 
          planta_id: plantaId, 
          deleted_at: null, 
          classificacao: 'UAR' 
        }
      })
    ]);

    // Formatar dados de criticidade
    const criticidadeMap = equipamentosPorCriticidade.reduce((acc, item) => {
      acc[item.criticidade] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    return {
      planta: {
        id: planta.id,
        nome: planta.nome,
        localizacao: planta.localizacao,
      },
      totais: {
        equipamentos: totalEquipamentos,
        equipamentosUC,
        componentesUAR,
      },
      porCriticidade: {
        '1': criticidadeMap['1'] || 0,
        '2': criticidadeMap['2'] || 0,
        '3': criticidadeMap['3'] || 0,
        '4': criticidadeMap['4'] || 0,
        '5': criticidadeMap['5'] || 0,
      },
      financeiro: {
        valorTotalContabil: Number(valorTotal._sum.valor_contabil || 0),
      }
    };
  }
}