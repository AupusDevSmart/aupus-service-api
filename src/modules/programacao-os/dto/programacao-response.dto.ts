import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusProgramacaoOS, TipoOS, PrioridadeOS, OrigemOS, CondicaoOS } from '@prisma/client';

export class UsuarioSimpleDto {
  @ApiProperty({ description: 'ID do usuário' })
  id: string;

  @ApiProperty({ description: 'Nome do usuário' })
  nome: string;

  @ApiProperty({ description: 'Email do usuário' })
  email: string;
}

export class TarefaSimpleDto {
  @ApiProperty({ description: 'ID da tarefa' })
  id: string;

  @ApiProperty({ description: 'Nome da tarefa' })
  nome: string;

  @ApiProperty({ description: 'Categoria da tarefa' })
  categoria: string;

  @ApiProperty({ description: 'Tipo de manutenção' })
  tipo_manutencao: string;

  @ApiProperty({ description: 'Tempo estimado em horas' })
  tempo_estimado: number;

  @ApiProperty({ description: 'Duração estimada em horas' })
  duracao_estimada: number;
}

export class TarefaProgramacaoResponseDto {
  @ApiProperty({ description: 'ID do relacionamento' })
  id: string;

  @ApiProperty({ description: 'ID da programação' })
  programacao_id: string;

  @ApiProperty({ description: 'ID da tarefa' })
  tarefa_id: string;

  @ApiProperty({ description: 'Ordem de execução' })
  ordem: number;

  @ApiProperty({ description: 'Status da tarefa', enum: ['PENDENTE', 'CONCLUIDA', 'CANCELADA'] })
  status: string;

  @ApiPropertyOptional({ description: 'Observações da tarefa' })
  observacoes?: string;

  @ApiProperty({ description: 'Data de criação' })
  created_at: string;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: string;

  @ApiProperty({ description: 'Dados da tarefa', type: TarefaSimpleDto })
  tarefa: TarefaSimpleDto;
}

export class MaterialProgramacaoResponseDto {
  @ApiProperty({ description: 'ID do material' })
  id: string;

  @ApiProperty({ description: 'ID da programação' })
  programacao_id: string;

  @ApiProperty({ description: 'Descrição do material' })
  descricao: string;

  @ApiProperty({ description: 'Quantidade planejada' })
  quantidade_planejada: number;

  @ApiProperty({ description: 'Unidade de medida' })
  unidade: string;

  @ApiPropertyOptional({ description: 'Custo unitário' })
  custo_unitario?: number;

  @ApiPropertyOptional({ description: 'Custo total' })
  custo_total?: number;

  @ApiProperty({ description: 'Material confirmado' })
  confirmado: boolean;

  @ApiProperty({ description: 'Material disponível' })
  disponivel: boolean;

  @ApiPropertyOptional({ description: 'Observações' })
  observacoes?: string;

  @ApiProperty({ description: 'Data de criação' })
  created_at: string;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: string;
}

export class FerramentaProgramacaoResponseDto {
  @ApiProperty({ description: 'ID da ferramenta' })
  id: string;

  @ApiProperty({ description: 'ID da programação' })
  programacao_id: string;

  @ApiProperty({ description: 'Descrição da ferramenta' })
  descricao: string;

  @ApiProperty({ description: 'Quantidade' })
  quantidade: number;

  @ApiProperty({ description: 'Ferramenta confirmada' })
  confirmada: boolean;

  @ApiProperty({ description: 'Ferramenta disponível' })
  disponivel: boolean;

  @ApiPropertyOptional({ description: 'Observações' })
  observacoes?: string;

  @ApiProperty({ description: 'Data de criação' })
  created_at: string;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: string;
}

export class TecnicoProgramacaoResponseDto {
  @ApiProperty({ description: 'ID do técnico' })
  id: string;

  @ApiProperty({ description: 'ID da programação' })
  programacao_id: string;

  @ApiProperty({ description: 'Nome do técnico' })
  nome: string;

  @ApiProperty({ description: 'Especialidade' })
  especialidade: string;

  @ApiProperty({ description: 'Horas estimadas' })
  horas_estimadas: number;

  @ApiPropertyOptional({ description: 'Custo por hora' })
  custo_hora?: number;

  @ApiPropertyOptional({ description: 'Custo total' })
  custo_total?: number;

  @ApiProperty({ description: 'Técnico disponível' })
  disponivel: boolean;

  @ApiPropertyOptional({ description: 'ID do técnico no sistema' })
  tecnico_id?: string;

  @ApiProperty({ description: 'Data de criação' })
  created_at: string;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: string;
}

export class HistoricoProgramacaoResponseDto {
  @ApiProperty({ description: 'ID do histórico' })
  id: string;

  @ApiProperty({ description: 'ID da programação' })
  programacao_id: string;

  @ApiProperty({ description: 'Ação realizada' })
  acao: string;

  @ApiProperty({ description: 'Usuário que realizou a ação' })
  usuario: string;

  @ApiPropertyOptional({ description: 'ID do usuário' })
  usuario_id?: string;

  @ApiProperty({ description: 'Data da ação' })
  data: string;

  @ApiPropertyOptional({ description: 'Observações' })
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Status anterior', enum: StatusProgramacaoOS })
  status_anterior?: StatusProgramacaoOS;

  @ApiPropertyOptional({ description: 'Status novo', enum: StatusProgramacaoOS })
  status_novo?: StatusProgramacaoOS;

  @ApiPropertyOptional({ description: 'Dados extras' })
  dados_extras?: any;
}

export class ProgramacaoResponseDto {
  @ApiProperty({ description: 'ID da programação' })
  id: string;

  @ApiProperty({ description: 'Data de criação' })
  criado_em: string;

  @ApiProperty({ description: 'Data de atualização' })
  atualizado_em: string;

  @ApiPropertyOptional({ description: 'Data de exclusão' })
  deletado_em?: string;

  // Identificação
  @ApiProperty({ description: 'Código da programação', example: 'PRG-2025-001' })
  codigo: string;

  @ApiProperty({ description: 'Descrição da programação' })
  descricao: string;

  @ApiProperty({ description: 'Local da execução' })
  local: string;

  @ApiProperty({ description: 'Ativo/equipamento' })
  ativo: string;

  // Classificação
  @ApiProperty({ enum: CondicaoOS, description: 'Condição do equipamento' })
  condicoes: CondicaoOS;

  @ApiProperty({ enum: StatusProgramacaoOS, description: 'Status da programação' })
  status: StatusProgramacaoOS;

  @ApiProperty({ enum: TipoOS, description: 'Tipo da OS' })
  tipo: TipoOS;

  @ApiProperty({ enum: PrioridadeOS, description: 'Prioridade' })
  prioridade: PrioridadeOS;

  @ApiProperty({ enum: OrigemOS, description: 'Origem' })
  origem: OrigemOS;

  // Relacionamentos
  @ApiPropertyOptional({ description: 'ID da planta' })
  planta_id?: string;

  @ApiPropertyOptional({ description: 'ID do equipamento' })
  equipamento_id?: string;

  @ApiPropertyOptional({ description: 'ID da anomalia' })
  anomalia_id?: string;

  @ApiPropertyOptional({ description: 'ID do plano de manutenção' })
  plano_manutencao_id?: string;

  @ApiPropertyOptional({ description: 'Dados da origem' })
  dados_origem?: any;

  // Planejamento
  @ApiPropertyOptional({ description: 'Data de previsão de início' })
  data_previsao_inicio?: string;

  @ApiPropertyOptional({ description: 'Data de previsão de fim' })
  data_previsao_fim?: string;

  @ApiProperty({ description: 'Tempo estimado em horas' })
  tempo_estimado: number;

  @ApiProperty({ description: 'Duração estimada em horas' })
  duracao_estimada: number;

  // Requisitos de veículo
  @ApiProperty({ description: 'Necessita veículo' })
  necessita_veiculo: boolean;

  @ApiPropertyOptional({ description: 'ID do veículo reservado' })
  veiculo_id?: string;

  @ApiPropertyOptional({ description: 'Data de início da reserva' })
  reserva_data_inicio?: string;

  @ApiPropertyOptional({ description: 'Data de fim da reserva' })
  reserva_data_fim?: string;

  @ApiPropertyOptional({ description: 'Hora de início da reserva (HH:mm)' })
  reserva_hora_inicio?: string;

  @ApiPropertyOptional({ description: 'Hora de fim da reserva (HH:mm)' })
  reserva_hora_fim?: string;

  @ApiPropertyOptional({ description: 'Finalidade da reserva' })
  reserva_finalidade?: string;

  @ApiPropertyOptional({ description: 'Assentos necessários' })
  assentos_necessarios?: number;

  @ApiPropertyOptional({ description: 'Carga necessária em kg' })
  carga_necessaria?: number;

  @ApiPropertyOptional({ description: 'Observações sobre veículo' })
  observacoes_veiculo?: string;

  @ApiPropertyOptional({ description: 'ID da reserva de veículo vinculada' })
  reserva_id?: string;

  // Programação
  @ApiPropertyOptional({ description: 'Data e hora programada' })
  data_hora_programada?: string;

  @ApiPropertyOptional({ description: 'Responsável' })
  responsavel?: string;

  @ApiPropertyOptional({ description: 'ID do responsável' })
  responsavel_id?: string;

  @ApiPropertyOptional({ description: 'Time/equipe' })
  time_equipe?: string;

  // Custos
  @ApiPropertyOptional({ description: 'Orçamento previsto' })
  orcamento_previsto?: number;

  // Observações
  @ApiPropertyOptional({ description: 'Observações gerais' })
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Observações da programação' })
  observacoes_programacao?: string;

  @ApiPropertyOptional({ description: 'Justificativa' })
  justificativa?: string;

  @ApiPropertyOptional({ description: 'Motivo da rejeição' })
  motivo_rejeicao?: string;

  @ApiPropertyOptional({ description: 'Sugestões de melhoria quando rejeitada' })
  sugestoes_melhoria?: string;

  @ApiPropertyOptional({ description: 'Motivo do cancelamento' })
  motivo_cancelamento?: string;

  // Tarefas associadas
  @ApiPropertyOptional({ description: 'Tarefas da programação', type: [TarefaProgramacaoResponseDto] })
  tarefas_programacao?: TarefaProgramacaoResponseDto[];

  // Auditoria
  @ApiPropertyOptional({ description: 'Criado por' })
  criado_por?: string;

  @ApiPropertyOptional({ description: 'ID do criador' })
  criado_por_id?: string;

  @ApiPropertyOptional({ description: 'Analisado por' })
  analisado_por?: string;

  @ApiPropertyOptional({ description: 'ID do analisador' })
  analisado_por_id?: string;

  @ApiPropertyOptional({ description: 'Data da análise' })
  data_analise?: string;

  @ApiPropertyOptional({ description: 'Observações da análise' })
  observacoes_analise?: string;

  @ApiPropertyOptional({ description: 'Aprovado por' })
  aprovado_por?: string;

  @ApiPropertyOptional({ description: 'ID do aprovador' })
  aprovado_por_id?: string;

  @ApiPropertyOptional({ description: 'Data da aprovação' })
  data_aprovacao?: string;

  @ApiPropertyOptional({ description: 'Observações da aprovação' })
  observacoes_aprovacao?: string;

  @ApiPropertyOptional({ description: 'Ajustes no orçamento' })
  ajustes_orcamento?: number;

  @ApiPropertyOptional({ description: 'Data sugerida para programação' })
  data_programada_sugerida?: string;

  @ApiPropertyOptional({ description: 'Hora sugerida para programação (HH:mm)' })
  hora_programada_sugerida?: string;
}

export class ProgramacaoDetalhesResponseDto extends ProgramacaoResponseDto {
  @ApiProperty({ description: 'Materiais da programação', type: [MaterialProgramacaoResponseDto] })
  materiais: MaterialProgramacaoResponseDto[];

  @ApiProperty({ description: 'Ferramentas da programação', type: [FerramentaProgramacaoResponseDto] })
  ferramentas: FerramentaProgramacaoResponseDto[];

  @ApiProperty({ description: 'Técnicos da programação', type: [TecnicoProgramacaoResponseDto] })
  tecnicos: TecnicoProgramacaoResponseDto[];

  @ApiProperty({ description: 'Histórico da programação', type: [HistoricoProgramacaoResponseDto] })
  historico: HistoricoProgramacaoResponseDto[];

  @ApiPropertyOptional({ description: 'Ordem de serviço gerada (se aprovada)' })
  ordem_servico?: any;

  @ApiPropertyOptional({ description: 'Reserva de veículo vinculada (se houver)' })
  reserva_veiculo?: {
    id: string;
    veiculo_id: string;
    data_inicio: Date;
    data_fim: Date;
    hora_inicio: string;
    hora_fim: string;
    responsavel: string;
    finalidade: string;
    status: string;
    veiculo?: any;
  };
}

export class PaginationDto {
  @ApiProperty({ description: 'Página atual' })
  page: number;

  @ApiProperty({ description: 'Items por página' })
  limit: number;

  @ApiProperty({ description: 'Total de items' })
  total: number;

  @ApiProperty({ description: 'Total de páginas' })
  totalPages: number;
}

export class ProgramacaoStatsDto {
  @ApiProperty({ description: 'Programações em rascunho' })
  rascunho: number;

  @ApiProperty({ description: 'Programações pendentes' })
  pendentes: number;

  @ApiProperty({ description: 'Programações em análise' })
  em_analise: number;

  @ApiProperty({ description: 'Programações aprovadas' })
  aprovadas: number;

  @ApiProperty({ description: 'Programações rejeitadas' })
  rejeitadas: number;

  @ApiProperty({ description: 'Programações canceladas' })
  canceladas: number;
}

export class ListarProgramacoesResponseDto {
  @ApiProperty({ description: 'Lista de programações', type: [ProgramacaoResponseDto] })
  data: ProgramacaoResponseDto[];

  @ApiProperty({ description: 'Informações de paginação', type: PaginationDto })
  pagination: PaginationDto;

  @ApiProperty({ description: 'Estatísticas por status', type: ProgramacaoStatsDto })
  stats: ProgramacaoStatsDto;
}