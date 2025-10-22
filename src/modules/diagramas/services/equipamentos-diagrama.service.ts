import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AddEquipamentoDiagramaDto, UpdateEquipamentoDiagramaDto, AddEquipamentosBulkDto } from '../dto/add-equipamento-diagrama.dto';

@Injectable()
export class EquipamentosDiagramaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adiciona um equipamento ao diagrama
   */
  async addEquipamento(
    diagramaId: string,
    dto: AddEquipamentoDiagramaDto,
  ) {
    const { equipamentoId, posicao, rotacao, dimensoes, propriedades } = dto;

    console.log(`📍 [addEquipamento] Recebido:`, {
      equipamentoId,
      posicao,
      rotacao
    });

    // 1. Verificar se o diagrama existe
    const diagrama = await this.prisma.diagramas_unitarios.findFirst({
      where: { id: diagramaId, deleted_at: null },
    });

    if (!diagrama) {
      throw new NotFoundException('Diagrama não encontrado');
    }

    // 2. Verificar se o equipamento existe
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id: equipamentoId, deleted_at: null },
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    // 3. Verificar se o equipamento pertence à mesma unidade do diagrama
    if (equipamento.unidade_id !== diagrama.unidade_id) {
      throw new BadRequestException(
        'Equipamento não pertence à mesma unidade do diagrama',
      );
    }

    // 4. Verificar se o equipamento já está em outro diagrama
    // IMPORTANTE: Trim para evitar problemas com CHAR vs VARCHAR
    const equipamentoDiagramaId = equipamento.diagrama_id?.trim();
    const targetDiagramaId = diagramaId?.trim();

    if (equipamentoDiagramaId && equipamentoDiagramaId !== targetDiagramaId) {
      console.log(`⚠️ [addEquipamento] Equipamento já em outro diagrama:`, {
        equipamentoId,
        equipamentoDiagramaId,
        targetDiagramaId,
        saoIguais: equipamentoDiagramaId === targetDiagramaId
      });
      throw new ConflictException(
        'Equipamento já está posicionado em outro diagrama',
      );
    }

    // 4a. Se já está no mesmo diagrama, apenas atualizar posição
    const jaNoMesmoDiagrama = equipamentoDiagramaId === targetDiagramaId;

    // 5. Validar coordenadas
    if (posicao.x < 0 || posicao.y < 0) {
      throw new BadRequestException(
        'Coordenadas devem ser maiores ou iguais a 0',
      );
    }

    // 6. Validar rotação
    if (rotacao !== undefined && (rotacao < 0 || rotacao > 360)) {
      throw new BadRequestException('Rotação deve estar entre 0 e 360 graus');
    }

    // 7. Mesclar propriedades existentes com as novas
    const propriedadesExistentes = (equipamento.propriedades as any) || {};
    const propriedadesMescladas = propriedades
      ? { ...propriedadesExistentes, ...propriedades }
      : equipamento.propriedades;

    // 8. Atualizar equipamento
    console.log(`💾 [addEquipamento] Salvando no banco:`, {
      equipamentoId,
      posicao_x: posicao.x,
      posicao_y: posicao.y,
      rotacao: rotacao ?? 0
    });

    const equipamentoAtualizado = await this.prisma.equipamentos.update({
      where: { id: equipamentoId },
      data: {
        diagrama_id: diagramaId,
        posicao_x: posicao.x,
        posicao_y: posicao.y,
        rotacao: rotacao ?? 0,
        largura_customizada: dimensoes?.largura,
        altura_customizada: dimensoes?.altura,
        propriedades: propriedadesMescladas as any,
      },
    });

    console.log(`✅ [addEquipamento] Salvo com sucesso:`, {
      equipamentoId: equipamentoAtualizado.id,
      posicao_x: equipamentoAtualizado.posicao_x,
      posicao_y: equipamentoAtualizado.posicao_y,
      rotacao: equipamentoAtualizado.rotacao
    });

    return this.formatEquipamentoResponse(equipamentoAtualizado);
  }

  /**
   * Atualiza posição/propriedades de um equipamento no diagrama
   */
  async updateEquipamento(
    diagramaId: string,
    equipamentoId: string,
    dto: UpdateEquipamentoDiagramaDto,
  ) {
    const { posicao, rotacao, dimensoes, propriedades } = dto;

    // 1. Verificar se o equipamento está no diagrama
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: {
        id: equipamentoId,
        diagrama_id: diagramaId,
        deleted_at: null,
      },
    });

    if (!equipamento) {
      throw new NotFoundException(
        'Equipamento não encontrado ou não está no diagrama',
      );
    }

    // 2. Validar coordenadas se fornecidas
    if (posicao && (posicao.x < 0 || posicao.y < 0)) {
      throw new BadRequestException(
        'Coordenadas devem ser maiores ou iguais a 0',
      );
    }

    // 3. Validar rotação se fornecida
    if (rotacao !== undefined && (rotacao < 0 || rotacao > 360)) {
      throw new BadRequestException('Rotação deve estar entre 0 e 360 graus');
    }

    // 4. Mesclar propriedades
    const propriedadesExistentes = (equipamento.propriedades as any) || {};
    const propriedadesMescladas = propriedades
      ? { ...propriedadesExistentes, ...propriedades }
      : equipamento.propriedades;

    // 5. Atualizar equipamento
    const equipamentoAtualizado = await this.prisma.equipamentos.update({
      where: { id: equipamentoId },
      data: {
        posicao_x: posicao?.x,
        posicao_y: posicao?.y,
        rotacao,
        largura_customizada: dimensoes?.largura,
        altura_customizada: dimensoes?.altura,
        propriedades: propriedadesMescladas as any,
      },
    });

    return this.formatEquipamentoResponse(equipamentoAtualizado);
  }

  /**
   * Remove equipamento do diagrama (não deleta o equipamento, apenas limpa posicionamento)
   */
  async removeEquipamento(diagramaId: string, equipamentoId: string) {
    // 1. Verificar se o equipamento está no diagrama
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: {
        id: equipamentoId,
        diagrama_id: diagramaId,
        deleted_at: null,
      },
    });

    if (!equipamento) {
      throw new NotFoundException(
        'Equipamento não encontrado ou não está no diagrama',
      );
    }

    // 2. Remover em uma transação
    const resultado = await this.prisma.$transaction(async (tx) => {
      // Contar conexões que serão removidas
      const conexoesOrigem = await tx.equipamentos_conexoes.count({
        where: {
          equipamento_origem_id: equipamentoId,
          diagrama_id: diagramaId,
          deleted_at: null,
        },
      });

      const conexoesDestino = await tx.equipamentos_conexoes.count({
        where: {
          equipamento_destino_id: equipamentoId,
          diagrama_id: diagramaId,
          deleted_at: null,
        },
      });

      const totalConexoes = conexoesOrigem + conexoesDestino;

      // Soft delete das conexões deste equipamento
      await tx.equipamentos_conexoes.updateMany({
        where: {
          diagrama_id: diagramaId,
          OR: [
            { equipamento_origem_id: equipamentoId },
            { equipamento_destino_id: equipamentoId },
          ],
        },
        data: { deleted_at: new Date() },
      });

      // Limpar posicionamento do equipamento
      await tx.equipamentos.update({
        where: { id: equipamentoId },
        data: {
          diagrama_id: null,
          posicao_x: null,
          posicao_y: null,
          rotacao: null,
        },
      });

      return { totalConexoes };
    });

    return {
      equipamentoId,
      diagramaId: null,
      message: 'Equipamento removido do diagrama',
      conexoesRemovidas: resultado.totalConexoes,
    };
  }

  /**
   * Adiciona múltiplos equipamentos de uma vez
   */
  async addEquipamentosBulk(
    diagramaId: string,
    dto: AddEquipamentosBulkDto,
  ) {
    const { equipamentos } = dto;

    const resultados = {
      adicionados: 0,
      atualizados: 0,
      erros: 0,
      equipamentos: [],
    };

    for (const equipDto of equipamentos) {
      try {
        const resultado = await this.addEquipamento(diagramaId, equipDto);

        // Verificar se foi adição ou atualização
        const equipExistente = await this.prisma.equipamentos.findUnique({
          where: { id: equipDto.equipamentoId },
          select: { diagrama_id: true },
        });

        if (equipExistente?.diagrama_id === diagramaId) {
          resultados.atualizados++;
          resultados.equipamentos.push({
            ...resultado,
            status: 'updated',
          });
        } else {
          resultados.adicionados++;
          resultados.equipamentos.push({
            ...resultado,
            status: 'added',
          });
        }
      } catch (error) {
        resultados.erros++;
        resultados.equipamentos.push({
          equipamentoId: equipDto.equipamentoId,
          status: 'error',
          error: error.message,
        });
      }
    }

    return resultados;
  }

  /**
   * Formata a resposta do equipamento
   */
  private formatEquipamentoResponse(equipamento: any) {
    return {
      id: equipamento.id,
      diagramaId: equipamento.diagrama_id,
      nome: equipamento.nome,
      tag: equipamento.tag,
      posicao: {
        x: equipamento.posicao_x,
        y: equipamento.posicao_y,
      },
      rotacao: equipamento.rotacao || 0,
      dimensoes: {
        largura: equipamento.largura_customizada || 64,
        altura: equipamento.altura_customizada || 64,
      },
      propriedades: equipamento.propriedades,
      updatedAt: equipamento.updated_at,
    };
  }
}
