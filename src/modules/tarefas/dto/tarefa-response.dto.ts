// src/modules/tarefas/dto/tarefa-response.dto.ts
import { 
  StatusTarefa, 
  CategoriaTarefa, 
  TipoManutencao, 
  FrequenciaTarefa, 
  CondicaoAtivo,
  TipoRecurso,
  TipoAnexo
} from '@aupus/api-shared';

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

export class InstrucaoResumoDto {
  id: string;
  tag: string;
  nome: string;
  categoria: CategoriaTarefa;
  tipo_manutencao: TipoManutencao;
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
  instrucao_id?: string;
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
  instrucao?: InstrucaoResumoDto;
}
