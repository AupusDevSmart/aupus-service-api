// src/modules/planos-manutencao/dto/plano-resumo.dto.ts

export class PlanoResumoDto {
  id: string;
  nome: string;
  versao: string;
  equipamento_nome: string;
  equipamento_tipo?: string;
  planta_nome?: string;
  
  // Contadores
  total_tarefas: number;
  tarefas_ativas: number;

  // Estatísticas
  criticidade_media?: number;

  created_at: Date;
  updated_at: Date;
}