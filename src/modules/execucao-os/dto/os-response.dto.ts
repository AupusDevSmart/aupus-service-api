import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusOS, TipoOS, PrioridadeOS, OrigemOS, CondicaoOS, TipoAnexoOS } from '@prisma/client';

export class TarefaOSResponseDto {
  @ApiProperty({ description: 'ID do relacionamento' })
  id: string;

  @ApiProperty({ description: 'ID da OS' })
  os_id: string;

  @ApiProperty({ description: 'ID da tarefa' })
  tarefa_id: string;

  @ApiProperty({ description: 'Ordem de execução' })
  ordem: number;

  @ApiProperty({ description: 'Status da tarefa', enum: ['PENDENTE', 'CONCLUIDA', 'CANCELADA'] })
  status: string;

  @ApiPropertyOptional({ description: 'Data de conclusão' })
  data_conclusao?: string;

  @ApiPropertyOptional({ description: 'Quem concluiu' })
  concluida_por?: string;

  @ApiPropertyOptional({ description: 'Observações da tarefa' })
  observacoes?: string;

  @ApiProperty({ description: 'Data de criação' })
  created_at: string;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: string;

  @ApiProperty({ description: 'Dados da tarefa' })
  tarefa: {
    id: string;
    nome: string;
    categoria: string;
    tipo_manutencao: string;
  };
}

export class MaterialOSResponseDto {
  @ApiProperty({ description: 'ID do material' })
  id: string;

  @ApiProperty({ description: 'ID da OS' })
  os_id: string;

  @ApiProperty({ description: 'Descrição do material' })
  descricao: string;

  @ApiProperty({ description: 'Quantidade planejada' })
  quantidade_planejada: number;

  @ApiPropertyOptional({ description: 'Quantidade consumida' })
  quantidade_consumida?: number;

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

export class FerramentaOSResponseDto {
  @ApiProperty({ description: 'ID da ferramenta' })
  id: string;

  @ApiProperty({ description: 'ID da OS' })
  os_id: string;

  @ApiProperty({ description: 'Descrição da ferramenta' })
  descricao: string;

  @ApiProperty({ description: 'Quantidade' })
  quantidade: number;

  @ApiProperty({ description: 'Ferramenta confirmada' })
  confirmada: boolean;

  @ApiProperty({ description: 'Ferramenta disponível' })
  disponivel: boolean;

  @ApiProperty({ description: 'Ferramenta utilizada' })
  utilizada: boolean;

  @ApiPropertyOptional({ description: 'Condição antes do uso' })
  condicao_antes?: string;

  @ApiPropertyOptional({ description: 'Condição depois do uso' })
  condicao_depois?: string;

  @ApiPropertyOptional({ description: 'Observações' })
  observacoes?: string;

  @ApiProperty({ description: 'Data de criação' })
  created_at: string;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: string;
}

export class TecnicoOSResponseDto {
  @ApiProperty({ description: 'ID do técnico' })
  id: string;

  @ApiProperty({ description: 'ID da OS' })
  os_id: string;

  @ApiProperty({ description: 'Nome do técnico' })
  nome: string;

  @ApiProperty({ description: 'Especialidade' })
  especialidade: string;

  @ApiProperty({ description: 'Horas estimadas' })
  horas_estimadas: number;

  @ApiPropertyOptional({ description: 'Horas trabalhadas' })
  horas_trabalhadas?: number;

  @ApiPropertyOptional({ description: 'Custo por hora' })
  custo_hora?: number;

  @ApiPropertyOptional({ description: 'Custo total' })
  custo_total?: number;

  @ApiProperty({ description: 'Técnico disponível' })
  disponivel: boolean;

  @ApiProperty({ description: 'Técnico presente' })
  presente: boolean;

  @ApiPropertyOptional({ description: 'ID do técnico no sistema' })
  tecnico_id?: string;

  @ApiProperty({ description: 'Data de criação' })
  created_at: string;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: string;
}

export class ChecklistAtividadeResponseDto {
  @ApiProperty({ description: 'ID da atividade' })
  id: string;

  @ApiProperty({ description: 'ID da OS' })
  os_id: string;

  @ApiProperty({ description: 'Descrição da atividade' })
  atividade: string;

  @ApiProperty({ description: 'Ordem da atividade' })
  ordem: number;

  @ApiProperty({ description: 'Atividade concluída' })
  concluida: boolean;

  @ApiProperty({ description: 'Atividade obrigatória' })
  obrigatoria: boolean;

  @ApiPropertyOptional({ description: 'Tempo estimado em minutos' })
  tempo_estimado?: number;

  @ApiPropertyOptional({ description: 'Observações' })
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Data de conclusão' })
  concluida_em?: string;

  @ApiPropertyOptional({ description: 'Quem concluiu' })
  concluida_por?: string;

  @ApiPropertyOptional({ description: 'ID de quem concluiu' })
  concluida_por_id?: string;

  @ApiProperty({ description: 'Data de criação' })
  created_at: string;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: string;
}

export class AnexoOSResponseDto {
  @ApiProperty({ description: 'ID do anexo' })
  id: string;

  @ApiProperty({ description: 'ID da OS' })
  os_id: string;

  @ApiProperty({ description: 'Nome do arquivo' })
  nome: string;

  @ApiProperty({ description: 'Nome original do arquivo' })
  nome_original: string;

  @ApiProperty({ enum: TipoAnexoOS, description: 'Tipo do anexo' })
  tipo: TipoAnexoOS;

  @ApiProperty({ description: 'Tipo MIME' })
  mime_type: string;

  @ApiProperty({ description: 'Tamanho em bytes' })
  tamanho: number;

  @ApiPropertyOptional({ description: 'Descrição do anexo' })
  descricao?: string;

  @ApiProperty({ description: 'Caminho do arquivo' })
  caminho_s3: string;

  @ApiPropertyOptional({ description: 'URL de download' })
  url_download?: string;

  @ApiPropertyOptional({ description: 'Fase da execução' })
  fase_execucao?: string;

  @ApiProperty({ description: 'Data de upload' })
  uploaded_at: string;

  @ApiPropertyOptional({ description: 'Quem fez upload' })
  uploaded_by?: string;

  @ApiPropertyOptional({ description: 'ID de quem fez upload' })
  uploaded_by_id?: string;

  @ApiPropertyOptional({ description: 'Data de exclusão' })
  deletado_em?: string;
}

export class RegistroTempoOSResponseDto {
  @ApiProperty({ description: 'ID do registro' })
  id: string;

  @ApiProperty({ description: 'ID da OS' })
  os_id: string;

  @ApiPropertyOptional({ description: 'ID do técnico' })
  tecnico_id?: string;

  @ApiProperty({ description: 'Nome do técnico' })
  tecnico_nome: string;

  @ApiProperty({ description: 'Data de início' })
  data_inicio: string;

  @ApiProperty({ description: 'Hora de início' })
  hora_inicio: string;

  @ApiPropertyOptional({ description: 'Data de fim' })
  data_fim?: string;

  @ApiPropertyOptional({ description: 'Hora de fim' })
  hora_fim?: string;

  @ApiPropertyOptional({ description: 'Tempo total em minutos' })
  tempo_total?: number;

  @ApiProperty({ description: 'Atividade executada' })
  atividade: string;

  @ApiPropertyOptional({ description: 'Observações' })
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Pausas durante execução' })
  pausas?: any;

  @ApiProperty({ description: 'Data de criação' })
  created_at: string;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: string;
}

export class HistoricoOSResponseDto {
  @ApiProperty({ description: 'ID do histórico' })
  id: string;

  @ApiProperty({ description: 'ID da OS' })
  os_id: string;

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

  @ApiPropertyOptional({ description: 'Status anterior', enum: StatusOS })
  status_anterior?: StatusOS;

  @ApiPropertyOptional({ description: 'Status novo', enum: StatusOS })
  status_novo?: StatusOS;

  @ApiPropertyOptional({ description: 'Dados extras' })
  dados_extras?: any;
}

export class ReservaVeiculoResponseDto {
  @ApiProperty({ description: 'ID da reserva' })
  id: string;

  @ApiProperty({ description: 'ID do veículo' })
  veiculo_id: string;

  @ApiPropertyOptional({ description: 'Dados do veículo' })
  veiculo?: {
    id: string;
    placa: string;
    modelo?: string;
    marca?: string;
  };

  @ApiPropertyOptional({ description: 'ID do solicitante' })
  solicitante_id?: string;

  @ApiProperty({ description: 'Tipo do solicitante' })
  tipo_solicitante: string;

  @ApiProperty({ description: 'Data de início' })
  data_inicio: string;

  @ApiProperty({ description: 'Data de fim' })
  data_fim: string;

  @ApiProperty({ description: 'Hora de início' })
  hora_inicio: string;

  @ApiProperty({ description: 'Hora de fim' })
  hora_fim: string;

  @ApiProperty({ description: 'Responsável' })
  responsavel: string;

  @ApiPropertyOptional({ description: 'ID do responsável' })
  responsavel_id?: string;

  @ApiProperty({ description: 'Finalidade da reserva' })
  finalidade: string;

  @ApiProperty({ description: 'Status da reserva' })
  status: string;

  @ApiPropertyOptional({ description: 'KM inicial' })
  km_inicial?: number;

  @ApiPropertyOptional({ description: 'KM final' })
  km_final?: number;

  @ApiPropertyOptional({ description: 'Observações da finalização' })
  observacoes_finalizacao?: string;

  @ApiPropertyOptional({ description: 'Observações gerais' })
  observacoes?: string;

  @ApiProperty({ description: 'Data de criação' })
  criado_em: string;

  @ApiProperty({ description: 'Data de atualização' })
  atualizado_em: string;
}

export class OrdemServicoResponseDto {
  @ApiProperty({ description: 'ID da OS' })
  id: string;

  @ApiProperty({ description: 'Data de criação' })
  criado_em: string;

  @ApiProperty({ description: 'Data de atualização' })
  atualizado_em: string;

  @ApiPropertyOptional({ description: 'Data de exclusão' })
  deletado_em?: string;

  // Relacionamento
  @ApiProperty({ description: 'ID da programação origem' })
  programacao_id: string;

  // Identificação
  @ApiProperty({ description: 'Número da OS', example: 'OS-2025-001' })
  numero_os: string;

  @ApiProperty({ description: 'Descrição da OS' })
  descricao: string;

  @ApiProperty({ description: 'Local da execução' })
  local: string;

  @ApiProperty({ description: 'Ativo/equipamento' })
  ativo: string;

  // Classificação
  @ApiProperty({ enum: CondicaoOS, description: 'Condição do equipamento' })
  condicoes: CondicaoOS;

  @ApiProperty({ enum: StatusOS, description: 'Status da OS' })
  status: StatusOS;

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

  @ApiPropertyOptional({ description: 'ID da reserva de veículo' })
  reserva_id?: string;

  @ApiPropertyOptional({ description: 'Dados da origem' })
  dados_origem?: any;

  // Planejamento
  @ApiProperty({ description: 'Tempo estimado em horas' })
  tempo_estimado: number;

  @ApiProperty({ description: 'Duração estimada em horas' })
  duracao_estimada: number;

  // Programação definitiva
  @ApiProperty({ description: 'Data e hora programada' })
  data_hora_programada: string;

  @ApiProperty({ description: 'Responsável' })
  responsavel: string;

  @ApiPropertyOptional({ description: 'ID do responsável' })
  responsavel_id?: string;

  @ApiPropertyOptional({ description: 'Time/equipe' })
  time_equipe?: string;

  // Execução Real
  @ApiPropertyOptional({ description: 'Data e hora de início real' })
  data_hora_inicio_real?: string;

  @ApiPropertyOptional({ description: 'Data e hora de fim real' })
  data_hora_fim_real?: string;

  @ApiPropertyOptional({ description: 'Tempo real de execução em minutos' })
  tempo_real_execucao?: number;

  // Equipe presente
  @ApiPropertyOptional({ description: 'Equipe presente na execução' })
  equipe_presente?: string[];

  // Custos
  @ApiPropertyOptional({ description: 'Orçamento previsto' })
  orcamento_previsto?: number;

  @ApiPropertyOptional({ description: 'Custo real' })
  custo_real?: number;

  // Observações
  @ApiPropertyOptional({ description: 'Observações gerais' })
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Observações da programação' })
  observacoes_programacao?: string;

  @ApiPropertyOptional({ description: 'Observações da execução' })
  observacoes_execucao?: string;

  @ApiPropertyOptional({ description: 'Motivo do cancelamento' })
  motivo_cancelamento?: string;

  // Resultados
  @ApiPropertyOptional({ description: 'Resultado do serviço' })
  resultado_servico?: string;

  @ApiPropertyOptional({ description: 'Problemas encontrados' })
  problemas_encontrados?: string;

  @ApiPropertyOptional({ description: 'Recomendações' })
  recomendacoes?: string;

  @ApiPropertyOptional({ description: 'Data sugerida para próxima manutenção' })
  proxima_manutencao?: string;

  // Qualidade
  @ApiPropertyOptional({ description: 'Avaliação da qualidade (1-5)' })
  avaliacao_qualidade?: number;

  @ApiPropertyOptional({ description: 'Observações sobre qualidade' })
  observacoes_qualidade?: string;

  // Detalhes da execução
  @ApiPropertyOptional({ description: 'Atividades realizadas durante a execução' })
  atividades_realizadas?: string;

  @ApiPropertyOptional({ description: 'Percentual de conclusão do checklist (0-100)' })
  checklist_concluido?: number;

  @ApiPropertyOptional({ description: 'Procedimentos seguidos durante a execução' })
  procedimentos_seguidos?: string;

  @ApiPropertyOptional({ description: 'EPIs e equipamentos de segurança utilizados' })
  equipamentos_seguranca?: string;

  @ApiPropertyOptional({ description: 'Incidentes de segurança ocorridos' })
  incidentes_seguranca?: string;

  @ApiPropertyOptional({ description: 'Medidas de segurança adicionais adotadas' })
  medidas_seguranca_adicionais?: string;

  @ApiPropertyOptional({ description: 'Custos adicionais não planejados' })
  custos_adicionais?: number;

  // Tarefas associadas
  @ApiPropertyOptional({ description: 'Tarefas da OS', type: [TarefaOSResponseDto] })
  tarefas_os?: TarefaOSResponseDto[];

  // Recursos
  @ApiPropertyOptional({ description: 'Materiais da OS', type: [MaterialOSResponseDto] })
  materiais?: MaterialOSResponseDto[];

  @ApiPropertyOptional({ description: 'Ferramentas da OS', type: [FerramentaOSResponseDto] })
  ferramentas?: FerramentaOSResponseDto[];

  @ApiPropertyOptional({ description: 'Técnicos da OS', type: [TecnicoOSResponseDto] })
  tecnicos?: TecnicoOSResponseDto[];

  // Auditoria
  @ApiPropertyOptional({ description: 'Criado por' })
  criado_por?: string;

  @ApiPropertyOptional({ description: 'ID do criador' })
  criado_por_id?: string;

  @ApiPropertyOptional({ description: 'Programado por' })
  programado_por?: string;

  @ApiPropertyOptional({ description: 'ID do programador' })
  programado_por_id?: string;

  @ApiPropertyOptional({ description: 'Finalizado por' })
  finalizado_por?: string;

  @ApiPropertyOptional({ description: 'ID do finalizador' })
  finalizado_por_id?: string;

  @ApiPropertyOptional({ description: 'Aprovado por' })
  aprovado_por?: string;

  @ApiPropertyOptional({ description: 'ID do aprovador' })
  aprovado_por_id?: string;

  @ApiPropertyOptional({ description: 'Data da aprovação' })
  data_aprovacao?: string;

  // Relacionamentos expandidos
  @ApiPropertyOptional({ description: 'Dados da programação de origem' })
  programacao?: any;

  @ApiPropertyOptional({ description: 'Dados da anomalia' })
  anomalia?: any;

  @ApiPropertyOptional({ description: 'Dados do plano de manutenção' })
  plano_manutencao?: any;

  @ApiPropertyOptional({ description: 'Reserva de veículo', type: ReservaVeiculoResponseDto })
  reserva_veiculo?: ReservaVeiculoResponseDto;
}

export class OrdemServicoDetalhesResponseDto extends OrdemServicoResponseDto {
  @ApiProperty({ description: 'Programação origem' })
  programacao_origem: any;

  @ApiProperty({ description: 'Materiais da OS', type: [MaterialOSResponseDto] })
  materiais: MaterialOSResponseDto[];

  @ApiProperty({ description: 'Ferramentas da OS', type: [FerramentaOSResponseDto] })
  ferramentas: FerramentaOSResponseDto[];

  @ApiProperty({ description: 'Técnicos da OS', type: [TecnicoOSResponseDto] })
  tecnicos: TecnicoOSResponseDto[];

  @ApiProperty({ description: 'Checklist de atividades', type: [ChecklistAtividadeResponseDto] })
  checklist: ChecklistAtividadeResponseDto[];

  @ApiProperty({ description: 'Anexos da OS', type: [AnexoOSResponseDto] })
  anexos: AnexoOSResponseDto[];

  @ApiProperty({ description: 'Registros de tempo', type: [RegistroTempoOSResponseDto] })
  registros_tempo: RegistroTempoOSResponseDto[];

  @ApiPropertyOptional({ description: 'Reserva de veículo', type: ReservaVeiculoResponseDto })
  reserva_veiculo?: ReservaVeiculoResponseDto;

  @ApiProperty({ description: 'Histórico da OS', type: [HistoricoOSResponseDto] })
  historico: HistoricoOSResponseDto[];
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

export class OSStatsDto {
  @ApiProperty({ description: 'OS planejadas' })
  planejadas: number;

  @ApiProperty({ description: 'OS programadas' })
  programadas: number;

  @ApiProperty({ description: 'OS em execução' })
  em_execucao: number;

  @ApiProperty({ description: 'OS pausadas' })
  pausadas: number;

  @ApiProperty({ description: 'OS finalizadas' })
  finalizadas: number;

  @ApiProperty({ description: 'OS canceladas' })
  canceladas: number;
}

export class ListarOSResponseDto {
  @ApiProperty({ description: 'Lista de OS', type: [OrdemServicoResponseDto] })
  data: OrdemServicoResponseDto[];

  @ApiProperty({ description: 'Informações de paginação', type: PaginationDto })
  pagination: PaginationDto;

  @ApiProperty({ description: 'Estatísticas por status', type: OSStatsDto })
  stats: OSStatsDto;
}