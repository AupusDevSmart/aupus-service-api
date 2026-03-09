// src/modules/planos-manutencao/helpers/planos-manutencao.validators.ts
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export class PlanosManutencaoValidators {
  constructor(private readonly prisma: PrismaService) {}

  async verificarEquipamentoExiste(equipamentoId: string): Promise<void> {
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

  async verificarPlantaExiste(plantaId: string): Promise<void> {
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

  async verificarUnidadeExiste(unidadeId: string): Promise<void> {
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

  async verificarPlanoExiste(id: string): Promise<void> {
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }
  }
}
