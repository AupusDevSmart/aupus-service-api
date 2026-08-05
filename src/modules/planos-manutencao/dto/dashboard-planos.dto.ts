// src/modules/planos-manutencao/dto/dashboard-planos.dto.ts

export class DashboardPlanosDto {
  total_planos: number;
  equipamentos_com_plano: number;

  // Estatísticas gerais
  total_tarefas_todos_planos: number;
  media_tarefas_por_plano: number;
}
