// src/modules/tarefas/dto/dashboard-tarefas.dto.ts
export class DashboardTarefasDto {
  total_tarefas: number;
  tarefas_ativas: number;
  tarefas_inativas: number;
  tarefas_em_revisao: number;
  tarefas_arquivadas: number;

  // Por criticidade
  criticidade_muito_alta: number; // 5
  criticidade_alta: number; // 4
  criticidade_media: number; // 3
  criticidade_baixa: number; // 2
  criticidade_muito_baixa: number; // 1

  // Por tipo de manutenção
  distribuicao_tipos: {
    preventiva: number;
    preditiva: number;
    corretiva: number;
    inspecao: number;
    visita_tecnica: number;
  };

  // Por categoria
  distribuicao_categorias: {
    mecanica: number;
    eletrica: number;
    instrumentacao: number;
    lubrificacao: number;
    limpeza: number;
    inspecao: number;
    calibracao: number;
    outros: number;
  };

  // Estatísticas gerais
  tempo_total_estimado: number;
  media_tempo_por_tarefa: number;
  media_criticidade: number;
  total_sub_tarefas: number;
  total_recursos: number;
}