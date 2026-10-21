// src/modules/instrucoes/dto/instrucao-response.dto.ts
import { StatusTarefa, TipoAnexo } from '@/core';
import type { Grupo, LinhaDeCusto, itemDoMaquinario, itemDoRecurso } from '../custo-da-instrucao';

export class UsuarioResumoDto {
  id: string;
  nome: string;
  email: string;
}

export class SubInstrucaoResponseDto {
  id: string;
  descricao: string;
  obrigatoria: boolean;
  /** SN-85: a disciplina (administrativo, civil, eletrico, mecanico) */
  tipo: string | null;
  /** SN-85: em horas */
  duracao_horas: number | null;
  ordem?: number;
  /** SN-58: VERIFICACAO ou LEITURA; unidade e faixa só na leitura */
  registro: string;
  /** SN-59: o item da OS só é marcado com uma foto dele */
  exige_foto: boolean;
  unidade?: string | null;
  valor_minimo?: number | null;
  valor_maximo?: number | null;
  created_at: Date;
  updated_at: Date;
}

/** O custo aberto da linha (`custo-da-instrucao.ts`): unidades, preço usado, do cadastro e subtotal */
type CustoDaLinha = Pick<LinhaDeCusto, 'unidades' | 'preco_base' | 'preco_cadastro' | 'subtotal'>;

export class RecursoInstrucaoResponseDto {
  id: string;
  recurso_id: string;
  /** O recurso do catálogo resumido, com o preço de uma unidade (sem o investimento: é do cadastro) */
  recurso: ReturnType<typeof itemDoRecurso>;
  quantidade: number;
  duracao_horas: number;
  fator_perda: number;
  fornecido_pelo_cliente: boolean;
  distancia_km: number | null;
  preco_proprio: number | null;
  unidades: CustoDaLinha['unidades'];
  preco_base: CustoDaLinha['preco_base'];
  preco_cadastro: CustoDaLinha['preco_cadastro'];
  /** Nulo sem preço (nunca zero); zero no fornecido pelo cliente */
  subtotal: CustoDaLinha['subtotal'];
  created_at: Date;
  updated_at: Date;
}

export class MaquinarioInstrucaoResponseDto {
  id: string;
  maquinario_id: string;
  maquinario: ReturnType<typeof itemDoMaquinario>;
  quantidade: number;
  duracao_horas: number;
  distancia_km: number | null;
  preco_proprio: number | null;
  unidades: CustoDaLinha['unidades'];
  preco_base: CustoDaLinha['preco_base'];
  preco_cadastro: CustoDaLinha['preco_cadastro'];
  subtotal: CustoDaLinha['subtotal'];
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
  /** SN-85: era tag */
  codigo: string;
  nome: string;
  descricao: string | null;
  frente: string | null;
  prazo_inicio_relativo: number;
  duracao_dias: number;
  observacoes?: string | null;
  status: StatusTarefa;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;
  criado_por?: string | null;
  atualizado_por?: string | null;

  // Relacionamentos
  usuario_criador?: UsuarioResumoDto | null;
  usuario_atualizador?: UsuarioResumoDto | null;

  // Sub-estruturas (só no detalhe)
  sub_instrucoes?: SubInstrucaoResponseDto[];
  recursos?: RecursoInstrucaoResponseDto[];
  maquinarios?: MaquinarioInstrucaoResponseDto[];
  anexos?: AnexoInstrucaoResponseDto[];

  /** O valor da instrução por grupo e o total; nulo quando alguma linha não tem preço (só no detalhe) */
  custo_por_grupo?: Record<Grupo, number | null>;
  custo?: number | null;
  /** A soma das durações dos passos, em horas (só no detalhe) */
  horas_dos_passos?: number;

  // Contadores calculados
  total_sub_instrucoes?: number;
  total_recursos?: number;
  total_maquinarios?: number;
  total_anexos?: number;
  total_tarefas_derivadas?: number;
}
