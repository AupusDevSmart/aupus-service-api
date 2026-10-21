// src/modules/instrucoes/dto/dashboard-instrucoes.dto.ts
// SN-85: saíram as contagens por criticidade, tipo e categoria, junto com os
// campos (a tela só mostrava total, ativas e tarefas derivadas).
export class DashboardInstrucoesDto {
  total_instrucoes: number;
  instrucoes_ativas: number;
  instrucoes_inativas: number;
  instrucoes_em_revisao: number;
  instrucoes_arquivadas: number;
  total_sub_instrucoes: number;
  total_recursos: number;
  total_maquinarios: number;
  total_tarefas_derivadas: number;
}
