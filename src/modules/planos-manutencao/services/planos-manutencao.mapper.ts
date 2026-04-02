// src/modules/planos-manutencao/services/planos-manutencao.mapper.ts
import { Injectable } from '@nestjs/common';
import { PlanoManutencaoResponseDto } from '../dto';

@Injectable()
export class PlanosManutencaoMapper {
  /**
   * Mapeia entidade do Prisma para DTO de resposta
   */
  mapearParaResponse(plano: any): PlanoManutencaoResponseDto {
    return {
      id: plano.id,
      equipamento_id: plano.equipamento_id,
      nome: plano.nome,
      descricao: plano.descricao,
      versao: plano.versao,
      status: plano.status,
      ativo: plano.ativo,
      data_vigencia_inicio: plano.data_vigencia_inicio,
      data_vigencia_fim: plano.data_vigencia_fim,
      observacoes: plano.observacoes,
      criado_por: plano.criado_por,
      atualizado_por: plano.atualizado_por,
      created_at: plano.created_at,
      updated_at: plano.updated_at,
      equipamento: plano.equipamento,
      usuario_criador: plano.usuario_criador,
      usuario_atualizador: plano.usuario_atualizador,
      tarefas: plano.tarefas?.map((tarefa: any) => ({
        id: tarefa.id,
        tag: tarefa.tag,
        nome: tarefa.nome,
        categoria: tarefa.categoria,
        tipo_manutencao: tarefa.tipo_manutencao,
        status: tarefa.status,
        ordem: tarefa.ordem,
        duracao_estimada: Number(tarefa.duracao_estimada),
        tempo_estimado: tarefa.tempo_estimado,
        total_sub_tarefas: tarefa._count?.sub_tarefas || 0,
        total_recursos: tarefa._count?.recursos || 0,
        total_anexos: tarefa._count?.anexos || 0,
        instrucao_id: tarefa.instrucao_id || null,
        instrucao_nome: tarefa.instrucao?.nome || null
      })),
      total_tarefas: plano._count?.tarefas || plano.tarefas?.length || 0,
      tarefas_ativas: plano.tarefas?.filter((t: any) => t.ativo)?.length || 0,
      tempo_total_estimado:
        plano.tarefas?.reduce((acc: number, t: any) => acc + t.tempo_estimado, 0) || 0,
      criticidade_media:
        plano.tarefas?.length > 0
          ? Math.round(
              (plano.tarefas.reduce((acc: number, t: any) => acc + t.criticidade, 0) /
                plano.tarefas.length) *
                10
            ) / 10
          : undefined
    };
  }
}
