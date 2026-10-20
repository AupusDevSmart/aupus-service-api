// src/modules/instrucoes/dto/instrucao-response.dto.ts
import {
  StatusTarefa,
  CategoriaTarefa,
  TipoManutencao,
  CondicaoAtivo,
  TipoRecurso,
  TipoAnexo,
  Prisma,
  type recursos,
} from '@/core';
import type { custoApurado } from '../../recursos/regras-do-recurso';

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
  /** SN-58: VERIFICACAO ou LEITURA; unidade e faixa só na leitura */
  tipo: string;
  /** SN-59: o item da OS só é marcado com uma foto dele */
  exige_foto: boolean;
  unidade?: string | null;
  valor_minimo?: number | null;
  valor_maximo?: number | null;
  created_at: Date;
  updated_at: Date;
}

export class RecursoInstrucaoResponseDto {
  id: string;
  /** Nulo nas linhas antigas, digitadas antes do catálogo */
  recurso_id?: string | null;
  /**
   * O recurso do catálogo, com o custo apurado (`preco_base`, a regra do
   * recurso, SN-83): a sugestão de valor da proposta usa o mesmo preço do servidor
   */
  recurso?: (recursos & Partial<ReturnType<typeof custoApurado>> & { bases_disponiveis?: readonly string[] }) | null;
  /** O custo da linha (preço da cobrança x as unidades); nulo sem preço */
  subtotal?: number | null;
  tipo: TipoRecurso;
  descricao: string;
  // Decimal(10,3) no banco, repassado sem conversao: no JSON chega como texto.
  quantidade?: Prisma.Decimal;
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
