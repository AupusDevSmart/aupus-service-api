// ===============================
// src/modules/ferramentas/services/manutencao.service.ts
// ===============================
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateManutencaoDto, StatusManutencao } from '../dto/create-manutencao.dto';
import { UpdateManutencaoDto } from '../dto/update-manutencao.dto';

@Injectable()
export class ManutencaoService {
  constructor(private prisma: PrismaService) {}

  async create(ferramentaId: string, createManutencaoDto: CreateManutencaoDto, criadoPor: string) {
    // Verificar se ferramenta existe
    const ferramenta = await this.prisma.ferramentas.findFirst({
      where: { id: ferramentaId, deleted_at: null },
    });

    if (!ferramenta) {
      throw new NotFoundException('Ferramenta não encontrada');
    }

    // Validar que se status é "em_andamento", data_fim deve ser null
    if (createManutencaoDto.status_manutencao === StatusManutencao.EM_ANDAMENTO && createManutencaoDto.data_fim) {
      throw new BadRequestException('Manutenção em andamento não pode ter data de fim');
    }

    // Validar datas se ambas estiverem presentes
    if (createManutencaoDto.data_fim) {
      const dataInicio = new Date(createManutencaoDto.data_inicio);
      const dataFim = new Date(createManutencaoDto.data_fim);
      
      if (dataFim <= dataInicio) {
        throw new BadRequestException('Data de fim deve ser posterior à data de início');
      }
    }

    // Criar registro de manutenção
    const manutencao = await this.prisma.historico_manutencoes.create({
      data: {
        ferramenta_id: ferramentaId,
        tipo_manutencao: createManutencaoDto.tipo_manutencao,
        data_inicio: new Date(createManutencaoDto.data_inicio),
        data_fim: createManutencaoDto.data_fim ? new Date(createManutencaoDto.data_fim) : null,
        status_manutencao: createManutencaoDto.status_manutencao,
        descricao: createManutencaoDto.descricao,
        solucao: createManutencaoDto.solucao,
        custo: createManutencaoDto.custo,
        fornecedor: createManutencaoDto.fornecedor,
        criado_por: criadoPor,
      },
      include: {
        criado_por_usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    // Atualizar status da ferramenta
    let novoStatus = ferramenta.status;
    if (createManutencaoDto.status_manutencao === StatusManutencao.EM_ANDAMENTO) {
      novoStatus = 'manutencao';
    } else if (createManutencaoDto.status_manutencao === StatusManutencao.CONCLUIDA && ferramenta.status === 'manutencao') {
      novoStatus = 'disponivel';
    }

    if (novoStatus !== ferramenta.status) {
      await this.prisma.ferramentas.update({
        where: { id: ferramentaId },
        data: { status: novoStatus },
      });
    }

    return manutencao;
  }

  async findAll(ferramentaId: string) {
    // Verificar se ferramenta existe
    const ferramenta = await this.prisma.ferramentas.findFirst({
      where: { id: ferramentaId, deleted_at: null },
    });

    if (!ferramenta) {
      throw new NotFoundException('Ferramenta não encontrada');
    }

    const manutencoes = await this.prisma.historico_manutencoes.findMany({
      where: { ferramenta_id: ferramentaId },
      include: {
        criado_por_usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
        atualizado_por_usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
      orderBy: { data_inicio: 'desc' },
    });

    return { data: manutencoes };
  }

  async update(ferramentaId: string, id: string, updateManutencaoDto: UpdateManutencaoDto, atualizadoPor: string) {
    // Verificar se manutenção existe
    const manutencao = await this.prisma.historico_manutencoes.findFirst({
      where: { id, ferramenta_id: ferramentaId },
    });

    if (!manutencao) {
      throw new NotFoundException('Manutenção não encontrada');
    }

    // Validações similares ao create
    if (updateManutencaoDto.status_manutencao === StatusManutencao.EM_ANDAMENTO && updateManutencaoDto.data_fim) {
      throw new BadRequestException('Manutenção em andamento não pode ter data de fim');
    }

    const updatedManutencao = await this.prisma.historico_manutencoes.update({
      where: { id },
      data: {
        ...updateManutencaoDto,
        ...(updateManutencaoDto.data_inicio && {
          data_inicio: new Date(updateManutencaoDto.data_inicio),
        }),
        ...(updateManutencaoDto.data_fim && {
          data_fim: new Date(updateManutencaoDto.data_fim),
        }),
        atualizado_por: atualizadoPor,
      },
      include: {
        criado_por_usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
        atualizado_por_usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    // Atualizar status da ferramenta se necessário
    if (updateManutencaoDto.status_manutencao) {
      const ferramenta = await this.prisma.ferramentas.findUnique({
        where: { id: ferramentaId },
      });

      let novoStatus = ferramenta.status;
      if (updateManutencaoDto.status_manutencao === StatusManutencao.EM_ANDAMENTO) {
        novoStatus = 'manutencao';
      } else if (updateManutencaoDto.status_manutencao === StatusManutencao.CONCLUIDA && ferramenta.status === 'manutencao') {
        novoStatus = 'disponivel';
      }

      if (novoStatus !== ferramenta.status) {
        await this.prisma.ferramentas.update({
          where: { id: ferramentaId },
          data: { status: novoStatus },
        });
      }
    }

    return updatedManutencao;
  }
}