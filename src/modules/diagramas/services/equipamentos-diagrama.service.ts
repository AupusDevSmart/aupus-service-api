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
    const { equipamentoId, posicao, rotacao, dimensoes, propriedades, labelPosition, labelOffset } = dto;

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

    // 7. Atualizar equipamento (V2 - sem customização de dimensões/propriedades)
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
        label_position: labelPosition || 'bottom',
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
    const { posicao, rotacao, dimensoes, propriedades, labelPosition, labelOffset } = dto;

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

    // 4. Atualizar equipamento (V2 - sem customização de dimensões/propriedades)
    const equipamentoAtualizado = await this.prisma.equipamentos.update({
      where: { id: equipamentoId },
      data: {
        posicao_x: posicao?.x,
        posicao_y: posicao?.y,
        rotacao,
        label_position: labelPosition,
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
   * Remove todos os equipamentos de um diagrama
   */
  async removeAll(diagramaId: string) {
    // 1. Verificar se o diagrama existe
    const diagrama = await this.prisma.diagramas_unitarios.findFirst({
      where: { id: diagramaId, deleted_at: null },
    });

    if (!diagrama) {
      throw new NotFoundException('Diagrama não encontrado');
    }

    // 2. Remover todos os equipamentos em uma transação
    const resultado = await this.prisma.$transaction(async (tx) => {
      // Contar equipamentos que serão removidos
      const totalEquipamentos = await tx.equipamentos.count({
        where: {
          diagrama_id: diagramaId,
          deleted_at: null,
        },
      });

      // Contar conexões que serão removidas
      const totalConexoes = await tx.equipamentos_conexoes.count({
        where: {
          diagrama_id: diagramaId,
          deleted_at: null,
        },
      });

      // Soft delete de todas as conexões do diagrama
      await tx.equipamentos_conexoes.updateMany({
        where: {
          diagrama_id: diagramaId,
          deleted_at: null,
        },
        data: { deleted_at: new Date() },
      });

      // Limpar posicionamento de todos os equipamentos do diagrama
      await tx.equipamentos.updateMany({
        where: {
          diagrama_id: diagramaId,
          deleted_at: null,
        },
        data: {
          diagrama_id: null,
          posicao_x: null,
          posicao_y: null,
          rotacao: null,
        },
      });

      return { totalEquipamentos, totalConexoes };
    });

    return {
      diagramaId,
      message: 'Todos os equipamentos foram removidos do diagrama',
      totalRemovidos: resultado.totalEquipamentos,
      conexoesRemovidas: resultado.totalConexoes,
    };
  }

  /**
   * Adiciona múltiplos equipamentos de uma vez - OTIMIZADO
   */
  async addEquipamentosBulk(
    diagramaId: string,
    dto: AddEquipamentosBulkDto,
  ) {
    const { equipamentos } = dto;

    console.log(`📦 [addEquipamentosBulk] Processing ${equipamentos.length} equipamentos`);

    // Usar transação para processar tudo de uma vez
    // ✅ CRÍTICO: Aumentar timeout para 30 segundos (suficiente para processar muitos equipamentos)
    return await this.prisma.$transaction(async (tx) => {
      const resultados = {
        adicionados: 0,
        atualizados: 0,
        erros: 0,
        equipamentos: [],
      };

      // 1. Verificar diagrama existe (uma vez)
      const diagrama = await tx.diagramas_unitarios.findFirst({
        where: { id: diagramaId, deleted_at: null },
      });

      if (!diagrama) {
        throw new NotFoundException('Diagrama não encontrado');
      }

      // 2. Buscar todos os equipamentos de uma vez
      const equipamentoIds = equipamentos.map(e => e.equipamentoId.trim());

      console.log(`🔍 [addEquipamentosBulk] Buscando equipamentos com IDs:`, equipamentoIds);

      const equipamentosExistentes = await tx.equipamentos.findMany({
        where: {
          id: { in: equipamentoIds },
          deleted_at: null,
        },
      });

      console.log(`📋 [addEquipamentosBulk] Encontrados ${equipamentosExistentes.length} equipamentos no banco`);
      if (equipamentosExistentes.length < equipamentoIds.length) {
        console.warn(`⚠️ [addEquipamentosBulk] Faltam ${equipamentoIds.length - equipamentosExistentes.length} equipamentos!`);
        console.warn(`   IDs solicitados:`, equipamentoIds);
        console.warn(`   IDs encontrados:`, equipamentosExistentes.map(e => e.id.trim()));
      }

      // Criar mapa para lookup rápido
      // ✅ CRÍTICO: Fazer trim do ID ao criar o Map para evitar problemas com CHAR vs VARCHAR
      const equipamentosMap = new Map(
        equipamentosExistentes.map(e => [e.id.trim(), e])
      );

      // 3. Processar cada equipamento
      for (const equipDto of equipamentos) {
        try {
          // IMPORTANTE: Trim no lookup também para garantir match!
          const equipamento = equipamentosMap.get(equipDto.equipamentoId.trim());

          if (!equipamento) {
            resultados.erros++;
            resultados.equipamentos.push({
              equipamentoId: equipDto.equipamentoId,
              status: 'error',
              error: 'Equipamento não encontrado',
            });
            continue;
          }

          // Verificar unidade
          if (equipamento.unidade_id !== diagrama.unidade_id) {
            resultados.erros++;
            resultados.equipamentos.push({
              equipamentoId: equipDto.equipamentoId,
              status: 'error',
              error: 'Equipamento não pertence à mesma unidade do diagrama',
            });
            continue;
          }

          // Verificar se já está em outro diagrama
          const equipamentoDiagramaId = equipamento.diagrama_id?.trim();
          const targetDiagramaId = diagramaId?.trim();

          if (equipamentoDiagramaId && equipamentoDiagramaId !== targetDiagramaId) {
            resultados.erros++;
            resultados.equipamentos.push({
              equipamentoId: equipDto.equipamentoId,
              status: 'error',
              error: 'Equipamento já está posicionado em outro diagrama',
            });
            continue;
          }

          // Atualizar equipamento (V2 - sem customização)
          const equipamentoAtualizado = await tx.equipamentos.update({
            where: { id: equipDto.equipamentoId },
            data: {
              diagrama_id: diagramaId,
              posicao_x: equipDto.posicao.x,
              posicao_y: equipDto.posicao.y,
              rotacao: equipDto.rotacao ?? 0,
              label_position: equipDto.labelPosition || 'bottom',
            },
          });

          const jaNoMesmoDiagrama = equipamentoDiagramaId === targetDiagramaId;
          if (jaNoMesmoDiagrama) {
            resultados.atualizados++;
          } else {
            resultados.adicionados++;
          }

          resultados.equipamentos.push({
            ...this.formatEquipamentoResponse(equipamentoAtualizado),
            status: jaNoMesmoDiagrama ? 'updated' : 'added',
          });
        } catch (error) {
          resultados.erros++;
          resultados.equipamentos.push({
            equipamentoId: equipDto.equipamentoId,
            status: 'error',
            error: error.message,
          });
        }
      }

      console.log(`✅ [addEquipamentosBulk] Results: ${resultados.adicionados} added, ${resultados.atualizados} updated, ${resultados.erros} errors`);

      return resultados;
    }, {
      maxWait: 30000, // Máximo 30 segundos esperando para começar a transação
      timeout: 30000, // Timeout de 30 segundos para executar a transação
    });
  }

  /**
   * Formata a resposta do equipamento (V2 - sem customização)
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
      label_position: equipamento.label_position,
      updatedAt: equipamento.updated_at,
    };
  }
}
// Force reload
