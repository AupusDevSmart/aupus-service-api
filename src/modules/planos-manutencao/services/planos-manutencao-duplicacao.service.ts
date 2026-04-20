// src/modules/planos-manutencao/services/planos-manutencao-duplicacao.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@aupus/api-shared';
import { StatusPlano } from '@prisma/client';
import {
  DuplicarPlanoDto,
  ClonarPlanoLoteDto,
  ClonarPlanoLoteResponseDto,
  PlanoManutencaoResponseDto
} from '../dto';
import { PlanosManutencaoValidators } from '../helpers/planos-manutencao.validators';
import { PlanosIncludeBuilder } from '../builders/planos-include.builder';
import { gerarNovaTag } from '../helpers/planos-manutencao.helpers';
import { PlanosManutencaoMapper } from './planos-manutencao.mapper';
import { PlanosManutencaoCrudService } from './planos-manutencao-crud.service';

@Injectable()
export class PlanosManutencaoDuplicacaoService {
  private validators: PlanosManutencaoValidators;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: PlanosManutencaoMapper,
    private readonly crudService: PlanosManutencaoCrudService
  ) {
    this.validators = new PlanosManutencaoValidators(prisma);
  }

  async duplicar(id: string, duplicarDto: DuplicarPlanoDto): Promise<PlanoManutencaoResponseDto> {
    // Verificar se plano original existe
    const planoOriginal = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      },
      include: PlanosIncludeBuilder.paraDuplicacao()
    });

    if (!planoOriginal) {
      throw new NotFoundException('Plano de manutenção original não encontrado');
    }

    // Verificar se equipamento destino existe
    await this.validators.verificarEquipamentoExiste(duplicarDto.equipamento_destino_id);

    // Verificar se equipamento destino já tem plano
    const planoDestino = await this.prisma.planos_manutencao.findFirst({
      where: {
        equipamento_id: duplicarDto.equipamento_destino_id,
        deleted_at: null
      }
    });

    if (planoDestino) {
      throw new ConflictException('O equipamento destino já possui um plano de manutenção');
    }

    // Buscar equipamento destino para gerar nome
    const equipamentoDestino = await this.prisma.equipamentos.findUnique({
      where: { id: duplicarDto.equipamento_destino_id },
      select: { nome: true }
    });

    const novoNome = duplicarDto.novo_nome || `${planoOriginal.nome} - ${equipamentoDestino?.nome || 'Cópia'}`;

    // Duplicar plano com todas as tarefas
    const planoDuplicado = await this.duplicarPlanoComTarefas(
      planoOriginal,
      duplicarDto.equipamento_destino_id,
      novoNome,
      duplicarDto.novo_prefixo_tag || 'TRF',
      duplicarDto.criado_por
    );

    // Retornar plano criado com relacionamentos
    return this.crudService.buscarPorId(planoDuplicado.id, true);
  }

  async clonarParaVariosEquipamentos(
    planoOrigemId: string,
    dto: ClonarPlanoLoteDto
  ): Promise<ClonarPlanoLoteResponseDto> {
    // Verificar se plano origem existe
    const planoOrigem = await this.prisma.planos_manutencao.findFirst({
      where: {
        id: planoOrigemId,
        deleted_at: null
      },
      include: PlanosIncludeBuilder.paraDuplicacao()
    });

    if (!planoOrigem) {
      throw new NotFoundException('Plano de manutenção original não encontrado');
    }

    const resultado: ClonarPlanoLoteResponseDto = {
      planos_criados: 0,
      planos_com_erro: 0,
      detalhes: []
    };

    // Processar cada equipamento destino
    for (const equipamentoId of dto.equipamentos_destino_ids) {
      try {
        // Buscar equipamento para pegar nome
        const equipamento = await this.prisma.equipamentos.findFirst({
          where: {
            id: equipamentoId,
            deleted_at: null
          },
          select: { nome: true }
        });

        if (!equipamento) {
          resultado.planos_com_erro++;
          resultado.detalhes.push({
            equipamento_id: equipamentoId,
            equipamento_nome: 'Desconhecido',
            sucesso: false,
            erro: 'Equipamento não encontrado'
          });
          continue;
        }

        // Verificar se equipamento já tem plano
        const planoExistente = await this.prisma.planos_manutencao.findFirst({
          where: {
            equipamento_id: equipamentoId,
            deleted_at: null
          }
        });

        if (planoExistente) {
          resultado.planos_com_erro++;
          resultado.detalhes.push({
            equipamento_id: equipamentoId,
            equipamento_nome: equipamento.nome,
            sucesso: false,
            erro: 'Equipamento já possui um plano de manutenção'
          });
          continue;
        }

        // Gerar novo nome do plano
        const novoNome = dto.manter_nome_original
          ? planoOrigem.nome
          : `${planoOrigem.nome} - ${equipamento.nome}`;

        // Duplicar plano
        const novoPlano = await this.duplicarPlanoComTarefas(
          planoOrigem,
          equipamentoId,
          novoNome,
          dto.novo_prefixo_tag || 'TRF',
          dto.criado_por
        );

        resultado.planos_criados++;
        resultado.detalhes.push({
          equipamento_id: equipamentoId,
          equipamento_nome: equipamento.nome,
          sucesso: true,
          plano_id: novoPlano.id,
          plano_nome: novoPlano.nome,
          total_tarefas: planoOrigem.tarefas.length
        });
      } catch (error) {
        resultado.planos_com_erro++;
        resultado.detalhes.push({
          equipamento_id: equipamentoId,
          equipamento_nome: 'Erro ao processar',
          sucesso: false,
          erro: error.message || 'Erro desconhecido'
        });
      }
    }

    return resultado;
  }

  /**
   * Método privado para duplicar plano com todas as tarefas
   */
  private async duplicarPlanoComTarefas(
    planoOriginal: any,
    equipamentoDestinoId: string,
    novoNome: string,
    prefixoTag: string,
    criadoPor?: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Criar novo plano
      const novoPlano = await tx.planos_manutencao.create({
        data: {
          equipamento_id: equipamentoDestinoId,
          nome: novoNome,
          descricao: planoOriginal.descricao,
          versao: '1.0', // Reset versão
          status: StatusPlano.ATIVO,
          ativo: true,
          data_vigencia_inicio: planoOriginal.data_vigencia_inicio,
          data_vigencia_fim: planoOriginal.data_vigencia_fim,
          observacoes: planoOriginal.observacoes,
          ...(criadoPor && { criado_por: criadoPor })
        }
      });

      // Duplicar todas as tarefas
      for (const tarefaOriginal of planoOriginal.tarefas) {
        // Gerar nova TAG
        const tarefasExistentes = await tx.tarefas.findMany({
          where: {
            plano_manutencao_id: novoPlano.id,
            deleted_at: null
          },
          select: { tag: true }
        });

        const novaTag = await gerarNovaTag(tarefasExistentes, prefixoTag);

        // Criar nova tarefa
        const novaTarefa = await tx.tarefas.create({
          data: {
            plano_manutencao_id: novoPlano.id,
            equipamento_id: equipamentoDestinoId,
            tag: novaTag,
            nome: tarefaOriginal.nome,
            descricao: tarefaOriginal.descricao,
            categoria: tarefaOriginal.categoria,
            tipo_manutencao: tarefaOriginal.tipo_manutencao,
            frequencia: tarefaOriginal.frequencia,
            frequencia_personalizada: tarefaOriginal.frequencia_personalizada,
            condicao_ativo: tarefaOriginal.condicao_ativo,
            criticidade: tarefaOriginal.criticidade,
            duracao_estimada: tarefaOriginal.duracao_estimada,
            tempo_estimado: tarefaOriginal.tempo_estimado,
            ordem: tarefaOriginal.ordem,
            planejador: tarefaOriginal.planejador,
            responsavel: tarefaOriginal.responsavel,
            observacoes: tarefaOriginal.observacoes,
            status: tarefaOriginal.status,
            ativo: tarefaOriginal.ativo,
            instrucao_id: tarefaOriginal.instrucao_id || null,
            ...(criadoPor && { criado_por: criadoPor })
          }
        });

        // Duplicar sub-tarefas
        for (const subTarefa of tarefaOriginal.sub_tarefas) {
          await tx.sub_tarefas.create({
            data: {
              tarefa_id: novaTarefa.id,
              descricao: subTarefa.descricao,
              obrigatoria: subTarefa.obrigatoria,
              tempo_estimado: subTarefa.tempo_estimado,
              ordem: subTarefa.ordem
            }
          });
        }

        // Duplicar recursos
        for (const recurso of tarefaOriginal.recursos) {
          await tx.recursos_tarefa.create({
            data: {
              tarefa_id: novaTarefa.id,
              tipo: recurso.tipo,
              descricao: recurso.descricao,
              quantidade: recurso.quantidade,
              unidade: recurso.unidade,
              obrigatorio: recurso.obrigatorio
            }
          });
        }

        // Anexos não são duplicados (apenas referências)
      }

      return novoPlano;
    });
  }
}
