// src/modules/plantas/plantas.service.ts - CORRIGIDO
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { Planta, ProprietarioBasico } from './entities/planta.entity';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { CreatePlantaDto } from './dto/create-planta.dto';
import { UpdatePlantaDto } from './dto/update-planta.dto';
import { FindAllPlantasDto } from './dto/find-all-plantas.dto';

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
export class PlantasService {
  constructor(private prisma: PrismaService) {}

  async create(createPlantaDto: CreatePlantaDto): Promise<Planta> {
    const { endereco, proprietarioId, cnpj, ...plantaData } = createPlantaDto;

    try {
      // 1. Verificar se o proprietário existe
      const proprietario = await this.prisma.usuarios.findUnique({
        where: { 
          id: proprietarioId,
          is_active: true,
          deleted_at: null
        },
        select: {
          id: true,
          nome: true,
          cpf_cnpj: true
        }
      });

      if (!proprietario) {
        throw new NotFoundException(`Proprietário com ID ${proprietarioId} não encontrado ou inativo`);
      }

      // 2. Verificar se CNPJ já existe
      const existingPlanta = await this.prisma.plantas.findUnique({
        where: { cnpj }
      });

      if (existingPlanta) {
        throw new ConflictException(`Já existe uma planta cadastrada com o CNPJ ${cnpj}`);
      }

      // 3. Criar a planta
      const novaPlanta = await this.prisma.plantas.create({
        data: {
          nome: plantaData.nome,
          cnpj,
          localizacao: plantaData.localizacao,
          horario_funcionamento: plantaData.horarioFuncionamento,
          logradouro: endereco.logradouro,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          uf: endereco.uf,
          cep: endereco.cep,
          proprietario_id: proprietarioId,
        },
        include: {
          proprietario: {
            select: {
              id: true,
              nome: true,
              cpf_cnpj: true
            }
          }
        }
      });

      return this.formatPlantaResponse(novaPlanta);

    } catch (error) {
      console.error('❌ [PLANTAS SERVICE] Erro ao criar planta:', error);
      
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }

      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('CNPJ já cadastrado no sistema');
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Proprietário inválido ou não encontrado');
        }
      }

      throw new BadRequestException('Erro interno ao cadastrar planta');
    }
  }

  // ✅ CORRIGIDO: Usando tipos genéricos do Prisma
  async findAll(queryDto: FindAllPlantasDto): Promise<PaginatedResponse<Planta>> {
    const {
      page = 1,
      limit = 10,
      search,
      proprietarioId,
      orderBy = 'nome',
      orderDirection = 'asc'
    } = queryDto;

    try {
      // ✅ CORRIGIDO: Usando tipo genérico any para WHERE
      const whereClause: any = {
        deleted_at: null,
        AND: []
      };

      // Filtro de busca textual
      if (search && search.trim()) {
        const searchTerm = search.trim();
        whereClause.OR = [
          { nome: { contains: searchTerm, mode: 'insensitive' } },
          { cnpj: { contains: searchTerm, mode: 'insensitive' } },
          { localizacao: { contains: searchTerm, mode: 'insensitive' } },
          { cidade: { contains: searchTerm, mode: 'insensitive' } },
          { logradouro: { contains: searchTerm, mode: 'insensitive' } }
        ];
      }

      // Filtro por proprietário
      if (proprietarioId && proprietarioId !== 'all') {
        whereClause.AND.push({
          proprietario_id: proprietarioId
        });
      }

      // ✅ CORRIGIDO: Construir ordenação com tipo genérico
      const orderByClause: any = {};
      
      switch (orderBy) {
        case 'nome':
          orderByClause.nome = orderDirection;
          break;
        case 'cnpj':
          orderByClause.cnpj = orderDirection;
          break;
        case 'localizacao':
          orderByClause.localizacao = orderDirection;
          break;
        case 'cidade':
          orderByClause.cidade = orderDirection;
          break;
        case 'criadoEm':
          orderByClause.created_at = orderDirection;
          break;
        case 'proprietario':
          orderByClause.proprietario = { nome: orderDirection };
          break;
        default:
          orderByClause.nome = 'asc';
      }

      // Calcular paginação
      const skip = (page - 1) * limit;

      // Buscar dados e contagem total em paralelo
      const [plantas, total] = await Promise.all([
        this.prisma.plantas.findMany({
          where: whereClause,
          include: {
            proprietario: {
              select: {
                id: true,
                nome: true,
                cpf_cnpj: true
              }
            }
          },
          orderBy: orderByClause,
          skip,
          take: limit
        }),
        this.prisma.plantas.count({
          where: whereClause
        })
      ]);

      // Formatar resposta
      const plantasFormatadas = plantas.map(planta => this.formatPlantaResponse(planta));

      const totalPages = Math.ceil(total / limit);

      return {
        data: plantasFormatadas,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };

    } catch (error) {
      console.error('❌ [PLANTAS SERVICE] Erro ao buscar plantas:', error);
      throw new BadRequestException('Erro interno ao buscar plantas');
    }
  }

  async findOne(id: string): Promise<Planta> {
    try {
      const planta = await this.prisma.plantas.findFirst({
        where: {
          id,
          deleted_at: null
        },
        include: {
          proprietario: {
            select: {
              id: true,
              nome: true,
              cpf_cnpj: true
            }
          }
        }
      });

      if (!planta) {
        throw new NotFoundException(`Planta com ID ${id} não encontrada`);
      }

      return this.formatPlantaResponse(planta);

    } catch (error) {
      console.error('❌ [PLANTAS SERVICE] Erro ao buscar planta:', error);
      
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException('Erro interno ao buscar planta');
    }
  }

  // ✅ CORRIGIDO: Usando tipos genéricos para UPDATE
  async update(id: string, updatePlantaDto: UpdatePlantaDto): Promise<Planta> {
    const { endereco, proprietarioId, cnpj, ...plantaData } = updatePlantaDto;

    try {
      // 1. Verificar se a planta existe
      const plantaExistente = await this.prisma.plantas.findFirst({
        where: {
          id,
          deleted_at: null
        }
      });

      if (!plantaExistente) {
        throw new NotFoundException(`Planta com ID ${id} não encontrada`);
      }

      // 2. Se há mudança de proprietário, verificar se ele existe
      if (proprietarioId && proprietarioId !== plantaExistente.proprietario_id) {
        const proprietario = await this.prisma.usuarios.findUnique({
          where: { 
            id: proprietarioId,
            is_active: true,
            deleted_at: null
          }
        });

        if (!proprietario) {
          throw new NotFoundException(`Proprietário com ID ${proprietarioId} não encontrado ou inativo`);
        }
      }

      // 3. Se há mudança de CNPJ, verificar se não existe outro com mesmo CNPJ
      if (cnpj && cnpj !== plantaExistente.cnpj) {
        const outraPlantaComCnpj = await this.prisma.plantas.findFirst({
          where: {
            cnpj,
            id: { not: id },
            deleted_at: null
          }
        });

        if (outraPlantaComCnpj) {
          throw new ConflictException(`Já existe outra planta cadastrada com o CNPJ ${cnpj}`);
        }
      }

      // ✅ CORRIGIDO: Usando tipo genérico any para UPDATE
      const updateData: any = {};

      // Campos básicos
      if (plantaData.nome !== undefined) updateData.nome = plantaData.nome;
      if (cnpj !== undefined) updateData.cnpj = cnpj;
      if (plantaData.localizacao !== undefined) updateData.localizacao = plantaData.localizacao;
      if (plantaData.horarioFuncionamento !== undefined) {
        updateData.horario_funcionamento = plantaData.horarioFuncionamento;
      }
      if (proprietarioId !== undefined) updateData.proprietario_id = proprietarioId;

      // Campos de endereço
      if (endereco) {
        if (endereco.logradouro !== undefined) updateData.logradouro = endereco.logradouro;
        if (endereco.bairro !== undefined) updateData.bairro = endereco.bairro;
        if (endereco.cidade !== undefined) updateData.cidade = endereco.cidade;
        if (endereco.uf !== undefined) updateData.uf = endereco.uf;
        if (endereco.cep !== undefined) updateData.cep = endereco.cep;
      }

      // 5. Atualizar a planta
      const plantaAtualizada = await this.prisma.plantas.update({
        where: { id },
        data: updateData,
        include: {
          proprietario: {
            select: {
              id: true,
              nome: true,
              cpf_cnpj: true
            }
          }
        }
      });

      return this.formatPlantaResponse(plantaAtualizada);

    } catch (error) {
      console.error('❌ [PLANTAS SERVICE] Erro ao atualizar planta:', error);
      
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }

      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('CNPJ já cadastrado no sistema');
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Proprietário inválido ou não encontrado');
        }
      }

      throw new BadRequestException('Erro interno ao atualizar planta');
    }
  }

  async findProprietarios() {
    const proprietarios = await this.prisma.usuarios.findMany({
      where: {
        is_active: true,
        deleted_at: null,
        OR: [
          { role: 'proprietario' },
          { role: 'admin' },
          { role: 'gerente' }
        ]
      },
      select: {
        id: true,
        nome: true,
        cpf_cnpj: true
      },
      orderBy: {
        nome: 'asc'
      }
    });

    return proprietarios.map(prop => ({
      id: prop.id,
      nome: prop.nome,
      cpf_cnpj: prop.cpf_cnpj,
      tipo: this.getTipoProprietario(prop.cpf_cnpj)
    }));
  }

  private formatPlantaResponse(plantaDb: any): Planta {
    return {
      id: plantaDb.id,
      nome: plantaDb.nome,
      cnpj: plantaDb.cnpj,
      localizacao: plantaDb.localizacao,
      horarioFuncionamento: plantaDb.horario_funcionamento,
      endereco: {
        logradouro: plantaDb.logradouro,
        bairro: plantaDb.bairro,
        cidade: plantaDb.cidade,
        uf: plantaDb.uf,
        cep: plantaDb.cep,
      },
      proprietarioId: plantaDb.proprietario_id,
      proprietario: plantaDb.proprietario ? {
        id: plantaDb.proprietario.id,
        nome: plantaDb.proprietario.nome,
        cpf_cnpj: plantaDb.proprietario.cpf_cnpj,
        tipo: this.getTipoProprietario(plantaDb.proprietario.cpf_cnpj),
      } : undefined,
      criadoEm: plantaDb.created_at,
      atualizadoEm: plantaDb.updated_at,
    };
  }

  async findUnidadesByPlanta(
    plantaId: string,
    tipo?: string,
    status?: string,
    comDiagrama?: boolean
  ) {
    try {
      // 1. Verificar se a planta existe
      const planta = await this.prisma.plantas.findFirst({
        where: {
          id: plantaId,
          deleted_at: null
        }
      });

      if (!planta) {
        throw new NotFoundException(`Planta com ID ${plantaId} não encontrada`);
      }

      // 2. Construir filtros
      const whereClause: any = {
        planta_id: plantaId,
        deleted_at: null
      };

      if (tipo) {
        whereClause.tipo = tipo;
      }

      if (status) {
        whereClause.status = status;
      }

      // 3. Buscar unidades com diagramas
      const unidades = await this.prisma.unidades.findMany({
        where: whereClause,
        include: {
          equipamentos: {
            where: { deleted_at: null },
            select: { id: true, diagrama_id: true }
          },
          _count: {
            select: {
              equipamentos: {
                where: { deleted_at: null }
              }
            }
          }
        },
        orderBy: {
          nome: 'asc'
        }
      });

      // 4. Para cada unidade, buscar diagramas
      const unidadesComDiagramas = await Promise.all(
        unidades.map(async (unidade) => {
          const diagramas = await this.prisma.diagramas_unitarios.findMany({
            where: {
              unidade_id: unidade.id,
              deleted_at: null
            },
            select: {
              id: true,
              nome: true,
              versao: true,
              ativo: true,
              thumbnail_url: true,
              updated_at: true
            },
            orderBy: {
              updated_at: 'desc'
            }
          });

          // Contar equipamentos no diagrama
          const totalEquipamentosNoDiagrama = unidade.equipamentos.filter(
            e => e.diagrama_id !== null
          ).length;

          return {
            id: unidade.id,
            nome: unidade.nome,
            tipo: unidade.tipo,
            estado: unidade.estado,
            cidade: unidade.cidade,
            latitude: unidade.latitude.toString(),
            longitude: unidade.longitude.toString(),
            potencia: unidade.potencia.toString(),
            status: unidade.status,
            totalEquipamentos: unidade._count.equipamentos,
            totalEquipamentosNoDiagrama,
            diagramas: diagramas.map(d => ({
              id: d.id,
              nome: d.nome,
              versao: d.versao,
              ativo: d.ativo,
              thumbnailUrl: d.thumbnail_url,
              updatedAt: d.updated_at
            })),
            createdAt: unidade.created_at,
            updatedAt: unidade.updated_at
          };
        })
      );

      // 5. Filtrar por comDiagrama se necessário
      let resultado = unidadesComDiagramas;
      if (comDiagrama !== undefined) {
        resultado = unidadesComDiagramas.filter(
          u => comDiagrama ? u.diagramas.length > 0 : u.diagramas.length === 0
        );
      }

      return {
        data: resultado,
        meta: {
          total: resultado.length,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ [PLANTAS SERVICE] Erro ao buscar unidades:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException('Erro interno ao buscar unidades da planta');
    }
  }

  private getTipoProprietario(cpfCnpj: string | null): 'pessoa_fisica' | 'pessoa_juridica' {
    if (!cpfCnpj) return 'pessoa_juridica';

    const digits = cpfCnpj.replace(/\D/g, '');
    return digits.length === 11 ? 'pessoa_fisica' : 'pessoa_juridica';
  }
}