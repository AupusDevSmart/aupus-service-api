// src/modules/instrucoes/dto/instrucao-response.dto.ts
import {
  StatusTarefa,
  CategoriaTarefa,
  TipoManutencao,
  CondicaoAtivo,
  TipoRecurso,
  TipoAnexo
} from '@aupus/api-shared';

export class UsuarioResumoDto {
  id: string;
  nome: string;
  email: string;
}

export class SubInstrucaoResponseDto {
  id: string;
  descricao: string;
  obrigatoria: boolean;
  tempo_estimado?: number;
  ordem?: number;
  created_at: Date;
  updated_at: Date;
}

export class RecursoInstrucaoResponseDto {
  id: string;
  tipo: TipoRecurso;
  descricao: string;
  quantidade?: number;
  unidade?: string;
  obrigatorio: boolean;
  created_at: Date;
  updated_at: Date;
}

export class AnexoInstrucaoResponseDto {
  id: string;
  nome: string;
  tipo: TipoAnexo;
  url: string;
  tamanho?: number;
  content_type?: string;
  created_at: Date;
  updated_at: Date;
}

export class InstrucaoResponseDto {
  id: string;
  tag: string;
  nome: string;
  descricao: string;
  categoria: CategoriaTarefa;
  tipo_manutencao: TipoManutencao;
  condicao_ativo: CondicaoAtivo;
  criticidade: number;
  duracao_estimada: number;
  tempo_estimado: number;
  observacoes?: string;
  status: StatusTarefa;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;
  criado_por?: string;
  atualizado_por?: string;

  // Relacionamentos
  usuario_criador?: UsuarioResumoDto;
  usuario_atualizador?: UsuarioResumoDto;

  // Sub-estruturas
  sub_instrucoes?: SubInstrucaoResponseDto[];
  recursos?: RecursoInstrucaoResponseDto[];
  anexos?: AnexoInstrucaoResponseDto[];

  // Contadores calculados
  total_sub_instrucoes?: number;
  total_recursos?: number;
  total_anexos?: number;
  total_tarefas_derivadas?: number;
}
