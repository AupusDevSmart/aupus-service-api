// src/modules/tarefas/dto/tarefa-response.dto.ts
import { 
  StatusTarefa, 
  CategoriaTarefa, 
  TipoManutencao, 
  FrequenciaTarefa, 
  CondicaoAtivo,
  TipoRecurso,
  TipoAnexo
} from '@prisma/client';

export class UsuarioResumoDto {
  id: string;
  nome: string;
  email: string;
}

export class PlanoResumoDto {
  id: string;
  nome: string;
  versao: string;
  status: string;
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

export class SubTarefaResponseDto {
  id: string;
  descricao: string;
  obrigatoria: boolean;
  tempo_estimado?: number;
  ordem?: number;
  created_at: Date;
  updated_at: Date;
}

export class RecursoTarefaResponseDto {
  id: string;
  tipo: TipoRecurso;
  descricao: string;
  quantidade?: number;
  unidade?: string;
  obrigatorio: boolean;
  created_at: Date;
  updated_at: Date;
}

export class AnexoTarefaResponseDto {
  id: string;
  nome: string;
  tipo: TipoAnexo;
  url: string;
  tamanho?: number;
  content_type?: string;
  created_at: Date;
  updated_at: Date;
}

export class TarefaResponseDto {
  id: string;
  plano_manutencao_id: string;
  tag: string;
  nome: string;
  descricao: string;
  categoria: CategoriaTarefa;
  tipo_manutencao: TipoManutencao;
  frequencia: FrequenciaTarefa;
  frequencia_personalizada?: number;
  condicao_ativo: CondicaoAtivo;
  criticidade: number;
  duracao_estimada: number;
  tempo_estimado: number;
  ordem?: number;
  planta_id?: string;
  equipamento_id: string;
  planejador?: string;
  responsavel?: string;
  observacoes?: string;
  status: StatusTarefa;
  ativo: boolean;
  data_ultima_execucao?: Date;
  numero_execucoes: number;
  created_at: Date;
  updated_at: Date;
  criado_por?: string;
  atualizado_por?: string;

  // Relacionamentos
  plano_manutencao?: PlanoResumoDto;
  planta?: PlantaResumoDto;
  equipamento?: EquipamentoResumoDto;
  usuario_criador?: UsuarioResumoDto;
  usuario_atualizador?: UsuarioResumoDto;

  // Sub-estruturas
  sub_tarefas?: SubTarefaResponseDto[];
  recursos?: RecursoTarefaResponseDto[];
  anexos?: AnexoTarefaResponseDto[];

  // Contadores calculados
  total_sub_tarefas?: number;
  total_recursos?: number;
  total_anexos?: number;
}
