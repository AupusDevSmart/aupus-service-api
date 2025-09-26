// src/modules/planos-manutencao/dto/plano-manutencao-response.dto.ts
import { StatusPlano } from '@prisma/client';

export class UsuarioResumoDto {
  id: string;
  nome: string;
  email: string;
}

export class EquipamentoResumoDto {
  id: string;
  nome: string;
  tipo_equipamento?: string;
  classificacao: string;
}

export class PlantaResumoDto {
  id: string;
  nome: string;
  localizacao: string;
}

export class TarefaResumoDto {
  id: string;
  tag: string;
  nome: string;
  categoria: string;
  tipo_manutencao: string;
  status: string;
  ordem: number;
  duracao_estimada: number;
  tempo_estimado: number;
  total_sub_tarefas?: number;
  total_recursos?: number;
  total_anexos?: number;
}

export class PlanoManutencaoResponseDto {
  id: string;
  equipamento_id: string;
  nome: string;
  descricao?: string;
  versao: string;
  status: StatusPlano;
  ativo: boolean;
  data_vigencia_inicio?: Date;
  data_vigencia_fim?: Date;
  observacoes?: string;
  criado_por?: string;
  atualizado_por?: string;
  created_at: Date;
  updated_at: Date;

  // Relacionamentos
  equipamento?: EquipamentoResumoDto;
  usuario_criador?: UsuarioResumoDto;
  usuario_atualizador?: UsuarioResumoDto;
  
  // Tarefas (opcional, dependendo da consulta)
  tarefas?: TarefaResumoDto[];
  
  // Estatísticas calculadas
  total_tarefas?: number;
  tarefas_ativas?: number;
  tempo_total_estimado?: number;
  criticidade_media?: number;
}