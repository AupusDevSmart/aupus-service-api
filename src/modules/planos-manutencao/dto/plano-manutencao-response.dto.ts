// src/modules/planos-manutencao/dto/plano-manutencao-response.dto.ts

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
  ordem: number;
  criticidade?: number;
  instrucao_id?: string;
  instrucao_nome?: string;
}

export class CategoriaResumoDto {
  id: string;
  nome: string;
}

export class PlanoManutencaoResponseDto {
  id: string;
  /** Preenchido no template; nulo na copia. */
  categoria_id?: string;
  /** Nulo no template; aponta para o template na copia. */
  plano_origem_id?: string;
  /** Derivado: true quando nao tem plano_origem_id. */
  is_template?: boolean;
  /** Quantos equipamentos usam este template (so faz sentido no template). */
  total_equipamentos_vinculados?: number;
  equipamento_id: string;
  nome: string;
  descricao?: string;
  versao: string;
  criado_por?: string;
  atualizado_por?: string;
  created_at: Date;
  updated_at: Date;

  // Relacionamentos
  categoria?: CategoriaResumoDto;
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