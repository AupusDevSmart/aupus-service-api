// src/modules/instrucoes/dto/dashboard-instrucoes.dto.ts
export class DashboardInstrucoesDto {
  total_instrucoes: number;
  instrucoes_ativas: number;
  instrucoes_inativas: number;
  instrucoes_em_revisao: number;
  instrucoes_arquivadas: number;

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
  media_tempo_por_instrucao: number;
  media_criticidade: number;
  total_sub_instrucoes: number;
  total_recursos: number;
  total_tarefas_derivadas: number;
}
