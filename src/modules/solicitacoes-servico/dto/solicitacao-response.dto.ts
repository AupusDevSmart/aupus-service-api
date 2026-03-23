import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  StatusSolicitacaoServico,
  TipoSolicitacaoServico,
  PrioridadeSolicitacao,
  OrigemSolicitacao
} from '@prisma/client';

export class SolicitacaoResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  numero: string;

  @ApiProperty()
  titulo: string;

  @ApiProperty()
  descricao: string;

  @ApiProperty({ enum: TipoSolicitacaoServico })
  tipo: TipoSolicitacaoServico;

  @ApiProperty({ enum: StatusSolicitacaoServico })
  status: StatusSolicitacaoServico;

  @ApiProperty({ enum: PrioridadeSolicitacao })
  prioridade: PrioridadeSolicitacao;

  @ApiProperty({ enum: OrigemSolicitacao })
  origem: OrigemSolicitacao;

  @ApiPropertyOptional()
  planta_id?: string;

  @ApiPropertyOptional()
  unidade_id?: string;

  @ApiPropertyOptional()
  proprietario_id?: string;

  @ApiPropertyOptional()
  equipamento_id?: string;

  @ApiProperty()
  local: string;

  @ApiPropertyOptional()
  area?: string;

  @ApiProperty()
  data_solicitacao: Date;

  @ApiPropertyOptional()
  data_necessidade?: Date;

  @ApiPropertyOptional()
  prazo_execucao?: number;

  @ApiPropertyOptional()
  data_prevista_inicio?: Date;

  @ApiPropertyOptional()
  data_prevista_fim?: Date;

  @ApiProperty()
  justificativa: string;

  @ApiPropertyOptional()
  beneficios_esperados?: string;

  @ApiPropertyOptional()
  riscos_nao_execucao?: string;

  @ApiPropertyOptional()
  tempo_estimado?: number;

  @ApiPropertyOptional()
  custo_estimado?: number;

  @ApiPropertyOptional()
  materiais_necessarios?: string;

  @ApiPropertyOptional()
  ferramentas_necessarias?: string;

  @ApiPropertyOptional()
  mao_obra_necessaria?: string;

  @ApiProperty()
  solicitante_nome: string;

  @ApiPropertyOptional()
  solicitante_id?: string;

  @ApiPropertyOptional()
  departamento?: string;

  @ApiPropertyOptional()
  contato?: string;

  @ApiPropertyOptional()
  analisado_por_nome?: string;

  @ApiPropertyOptional()
  data_analise?: Date;

  @ApiPropertyOptional()
  parecer_tecnico?: string;

  @ApiPropertyOptional()
  observacoes_analise?: string;

  @ApiPropertyOptional()
  aprovado_por_nome?: string;

  @ApiPropertyOptional()
  data_aprovacao?: Date;

  @ApiPropertyOptional()
  observacoes_aprovacao?: string;

  @ApiPropertyOptional()
  motivo_rejeicao?: string;

  @ApiPropertyOptional()
  motivo_cancelamento?: string;

  @ApiPropertyOptional()
  programacao_os_id?: string;

  @ApiPropertyOptional()
  ordem_servico_id?: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  // Relacionamentos opcionais
  @ApiPropertyOptional()
  planta?: any;

  @ApiPropertyOptional()
  unidade?: any;

  @ApiPropertyOptional()
  proprietario?: any;

  @ApiPropertyOptional()
  equipamento?: any;

  @ApiPropertyOptional()
  anexos?: any[];

  @ApiPropertyOptional()
  historico?: any[];

  @ApiPropertyOptional()
  comentarios?: any[];

  @ApiPropertyOptional({
    description: 'Tarefas associadas à solicitação',
    type: [Object]
  })
  tarefas?: any[];
}

export class ListarSolicitacoesResponseDto {
  @ApiProperty({ type: [SolicitacaoResponseDto] })
  data: SolicitacaoResponseDto[];

  @ApiProperty({
    example: {
      page: 1,
      limit: 10,
      total: 100,
      totalPages: 10
    }
  })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class SolicitacaoStatsDto {
  @ApiProperty({ description: 'Total de solicitações' })
  total: number;

  @ApiProperty({ description: 'Solicitações aguardando análise' })
  aguardando: number;

  @ApiProperty({ description: 'Solicitações em análise' })
  emAnalise: number;

  @ApiProperty({ description: 'Solicitações aprovadas' })
  aprovadas: number;

  @ApiProperty({ description: 'Solicitações com OS gerada' })
  osGerada: number;

  @ApiProperty({ description: 'Solicitações em execução' })
  emExecucao: number;

  @ApiProperty({ description: 'Solicitações concluídas' })
  concluidas: number;

  @ApiProperty({ description: 'Solicitações canceladas' })
  canceladas: number;

  @ApiProperty({ description: 'Solicitações rejeitadas' })
  rejeitadas: number;

  @ApiProperty({ description: 'Por prioridade' })
  porPrioridade: {
    baixa: number;
    media: number;
    alta: number;
    urgente: number;
  };

  @ApiProperty({ description: 'Por tipo' })
  porTipo: Record<string, number>;

  @ApiProperty({ description: 'Taxa de aprovação (%)' })
  taxaAprovacao: number;

  @ApiProperty({ description: 'Tempo médio de resposta (dias)' })
  tempoMedioResposta: number;
}