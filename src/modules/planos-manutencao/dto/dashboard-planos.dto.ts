// src/modules/planos-manutencao/dto/dashboard-planos.dto.ts

export class DashboardPlanosDto {
  total_planos: number;
  equipamentos_com_plano: number;
  
  // Estatísticas gerais
  total_tarefas_todos_planos: number;
  media_tarefas_por_plano: number;
  tempo_total_estimado_geral: number;
  
  // Distribuição por tipo de manutenção
  distribuicao_tipos: {
    preventiva: number;
    preditiva: number;
    corretiva: number;
    inspecao: number;
    visita_tecnica: number;
  };
}