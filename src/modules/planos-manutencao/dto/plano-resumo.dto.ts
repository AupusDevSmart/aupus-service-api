// src/modules/planos-manutencao/dto/plano-resumo.dto.ts
import { StatusPlano } from '@prisma/client';

export class PlanoResumoDto {
  id: string;
  nome: string;
  versao: string;
  status: StatusPlano;
  equipamento_nome: string;
  equipamento_tipo?: string;
  planta_nome?: string;
  
  // Contadores
  total_tarefas: number;
  tarefas_ativas: number;
  tarefas_em_revisao: number;
  
  // Estatísticas
  criticidade_media?: number;
  tempo_total_estimado: number;
  
  // Por tipo
  tarefas_preventivas: number;
  tarefas_preditivas: number;
  tarefas_corretivas: number;
  
  created_at: Date;
  updated_at: Date;
}