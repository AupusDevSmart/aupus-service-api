import { IsString, IsOptional, IsNumber, IsDateString, IsArray, IsNotEmpty, Length, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalisarProgramacaoDto {
  @ApiPropertyOptional({ description: 'Observações da análise' })
  @IsOptional()
  @IsString()
  observacoes_analise?: string;
}

export class AprovarProgramacaoDto {
  @ApiPropertyOptional({ description: 'Observações da aprovação' })
  @IsOptional()
  @IsString()
  observacoes_aprovacao?: string;

  @ApiPropertyOptional({ description: 'Ajustes no orçamento' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  ajustes_orcamento?: number;

  @ApiPropertyOptional({ description: 'Data programada sugerida (obrigatório se hora_programada_sugerida for informada)', example: '2025-02-15' })
  @ValidateIf(o => o.hora_programada_sugerida !== undefined && o.hora_programada_sugerida !== null)
  @IsNotEmpty({ message: 'data_programada_sugerida é obrigatória quando hora_programada_sugerida é informada' })
  @IsDateString()
  data_programada_sugerida?: string;

  @ApiPropertyOptional({ description: 'Hora programada sugerida (obrigatório se data_programada_sugerida for informada)', example: '08:00' })
  @ValidateIf(o => o.data_programada_sugerida !== undefined && o.data_programada_sugerida !== null)
  @IsNotEmpty({ message: 'hora_programada_sugerida é obrigatória quando data_programada_sugerida é informada' })
  @IsString()
  @Length(5, 5)
  hora_programada_sugerida?: string;
}

export class RejeitarProgramacaoDto {
  @ApiProperty({ description: 'Motivo da rejeição' })
  @IsString()
  @IsNotEmpty()
  motivo_rejeicao: string;

  @ApiPropertyOptional({ description: 'Sugestões de melhoria' })
  @IsOptional()
  @IsString()
  sugestoes_melhoria?: string;
}

export class CancelarProgramacaoDto {
  @ApiProperty({ description: 'Motivo do cancelamento' })
  @IsString()
  @IsNotEmpty()
  motivo_cancelamento: string;
}

export class CreateProgramacaoAnomaliaDto {
  @ApiPropertyOptional({ description: 'Ajustes na programação criada a partir da anomalia' })
  @IsOptional()
  ajustes?: {
    descricao?: string;
    prioridade?: string;
    tempo_estimado?: number;
  };
}

export class CreateProgramacaoTarefasDto {
  @ApiProperty({ description: 'IDs das tarefas selecionadas', example: ['clrx1234567890123456789012'] })
  @IsArray()
  @IsString({ each: true })
  tarefas_ids: string[];

  @ApiPropertyOptional({ description: 'Descrição customizada' })
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiPropertyOptional({ description: 'Prioridade geral' })
  @IsOptional()
  @IsString()
  prioridade?: string;

  @ApiPropertyOptional({ description: 'Data e hora sugerida', example: '2025-02-15T08:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_hora_programada?: string;

  @ApiPropertyOptional({ description: 'Responsável sugerido' })
  @IsOptional()
  @IsString()
  responsavel?: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Critério de agrupamento automático', enum: ['equipamento', 'planta', 'categoria'] })
  @IsOptional()
  @IsString()
  agrupar_por?: 'equipamento' | 'planta' | 'categoria';
}

export class AdicionarTarefasDto {
  @ApiProperty({ description: 'IDs das tarefas a serem adicionadas' })
  @IsArray()
  @IsString({ each: true })
  tarefas_ids: string[];

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class AtualizarTarefaDto {
  @ApiProperty({ description: 'ID da tarefa' })
  @IsString()
  @Length(26, 26)
  tarefa_id: string;

  @ApiProperty({ description: 'Ordem de execução' })
  @IsNumber()
  ordem: number;

  @ApiPropertyOptional({ description: 'Status da tarefa', enum: ['PENDENTE', 'CONCLUIDA', 'CANCELADA'] })
  @IsOptional()
  @IsString()
  status?: 'PENDENTE' | 'CONCLUIDA' | 'CANCELADA';

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class AtualizarTarefasDto {
  @ApiProperty({ description: 'Lista de tarefas para atualizar', type: [AtualizarTarefaDto] })
  @IsArray()
  tarefas: AtualizarTarefaDto[];
}