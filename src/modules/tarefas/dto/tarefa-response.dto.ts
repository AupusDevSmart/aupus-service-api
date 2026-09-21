// src/modules/tarefas/dto/tarefa-response.dto.ts
// StatusTarefa, CondicaoAtivo, TipoRecurso e TipoAnexo sairam junto com as
// colunas que os usavam: hoje quem tem status, condicao do ativo, recurso e
// anexo e a INSTRUCAO, nao a tarefa.
import {
  CategoriaTarefa,
  TipoManutencao,
  FrequenciaTarefa,
  OrigemTarefa
} from '@/core';

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

/**
 * A tarefa e o VINCULO entre um plano e uma instrucao: quatro campos de
 * definicao (nome, instrucao, periodicidade, criticidade) mais o estado de
 * sistema.
 *
 * O conteudo — descricao, categoria, tipo de manutencao, condicao do ativo,
 * duracao, tempo, sub-etapas e recursos — foi droppado da tabela `tarefas` no
 * PR6 e vive na INSTRUCAO. Leia por `instrucao`; para o que a OS pediu na
 * epoca, leia os campos `*_snapshot` de `tarefas_os`, nunca a tarefa viva.
 */
export class TarefaResponseDto {
  id: string;
  plano_manutencao_id: string;
  tag: string;
  nome: string;
  frequencia: FrequenciaTarefa;
  frequencia_personalizada?: number;
  criticidade: number;
  ordem?: number;
  planta_id?: string;
  equipamento_id: string;
  instrucao_id?: string;
  ativo: boolean;
  data_ultima_execucao?: Date;
  numero_execucoes: number;
  /**
   * Base do ciclo do agendador. Viaja junto da ultima execucao porque a proxima
   * sai do MAIOR entre as duas — mostrar so uma delas faz a tela concluir um
   * vencimento diferente do que o cron vai gerar.
   */
  data_ancora?: Date;
  /** HERDADA, CUSTOMIZADA, REMOVIDA ou PROPRIA. */
  origem_status?: OrigemTarefa;
  /** A tarefa do template de que esta copia saiu. */
  tarefa_origem_id?: string;
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
