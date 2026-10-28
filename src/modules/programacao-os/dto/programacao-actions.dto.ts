import { IsString, IsOptional, IsNumber, IsArray, IsNotEmpty, Length, IsEnum, ValidateNested, ArrayMaxSize, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { PrioridadeOS } from '@/core';
import { CreateProgramacaoDto } from './create-programacao.dto';
import { CasasDecimais } from '@/common/decorators/numero';
import { DiaDeCalendario } from '@/common/decorators/dia-de-calendario';
import { HoraDoDia, InstanteComFuso } from '@/common/decorators/instante';

export class AprovarProgramacaoDto {
  @ApiPropertyOptional({ description: 'Observações da aprovação' })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Ajustes no orçamento' })
  @IsOptional()
  @IsNumber()
  @CasasDecimais(2)
  ajustes_orcamento?: number;

  @ApiPropertyOptional({ description: 'Data programada sugerida', example: '2025-02-15' })
  @IsOptional()
  @DiaDeCalendario({ comoTexto: true })
  data_programada_sugerida?: string;

  @ApiPropertyOptional({ description: 'Hora programada sugerida', example: '08:00' })
  @IsOptional()
  @HoraDoDia()
  hora_programada_sugerida?: string;
}

export class FinalizarProgramacaoDto {
  @ApiPropertyOptional({ description: 'Observações da finalização' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class CancelarProgramacaoDto {
  @ApiProperty({ description: 'Motivo do cancelamento' })
  @IsString()
  @IsNotEmpty()
  motivo_cancelamento: string;
}

/** Antes era um objeto sem validação: qualquer prioridade chegava crua ao Prisma (500). */
export class AjustesDaProgramacaoDaAnomaliaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiPropertyOptional({ enum: PrioridadeOS })
  @IsOptional()
  @IsEnum(PrioridadeOS)
  prioridade?: PrioridadeOS;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  tempo_estimado?: number;
}

export class CreateProgramacaoAnomaliaDto {
  @ApiPropertyOptional({ description: 'Ajustes na programação criada a partir da anomalia', type: AjustesDaProgramacaoDaAnomaliaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AjustesDaProgramacaoDaAnomaliaDto)
  ajustes?: AjustesDaProgramacaoDaAnomaliaDto;
}

/**
 * O que se ajusta na programação gerada da solicitação. Antes o corpo era
 * `Partial<CreateProgramacaoDto>` — tipo sem classe, que o ValidationPipe não
 * valida —, e o `...dto` no service sobrescrevia qualquer campo, inclusive a
 * solicitação, a planta e a origem (SN-40). O que vem da solicitação (origem,
 * planta, equipamento, tipo) não se ajusta aqui.
 */
export const AJUSTES_DA_PROGRAMACAO_DA_SOLICITACAO = [
  'descricao',
  'prioridade',
  'tempo_estimado',
  'duracao_estimada',
  'data_previsao_inicio',
  'data_previsao_fim',
  'data_hora_programada',
  'responsavel',
  'observacoes',
  'observacoes_programacao',
  'justificativa',
] as const;

/**
 * O lugar, só para a solicitação sem planta (28/out/2026): a planta e a
 * instalação se escolhem ao programar. A que tem planta não é sobrescrita (SN-40).
 */
export const LUGAR_DA_SOLICITACAO_SEM_PLANTA = ['planta_id', 'unidade_id'] as const;

export class AjustesDaProgramacaoDaSolicitacaoDto extends PartialType(
  PickType(CreateProgramacaoDto, [...AJUSTES_DA_PROGRAMACAO_DA_SOLICITACAO, ...LUGAR_DA_SOLICITACAO_SEM_PLANTA] as const),
) {}

export class CreateProgramacaoTarefasDto {
  @ApiProperty({ description: 'IDs das tarefas selecionadas', example: ['clrx1234567890123456789012'] })
  @IsArray()
  @IsString({ each: true })
  tarefas_ids: string[];

  @ApiPropertyOptional({ description: 'Descrição customizada' })
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiPropertyOptional({ description: 'Prioridade geral', enum: PrioridadeOS })
  @IsOptional()
  @IsEnum(PrioridadeOS)
  prioridade?: PrioridadeOS;

  @ApiPropertyOptional({ description: 'Data e hora sugerida', example: '2025-02-15T08:00:00Z' })
  @IsOptional()
  @InstanteComFuso()
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
  // Até 26: o id antigo (cuid) tem 25 caracteres
  @Length(1, 26)
  tarefa_id: string;

  @ApiProperty({ description: 'Ordem de execução' })
  @IsNumber()
  ordem: number;

  @ApiPropertyOptional({ description: 'Status da tarefa', enum: ['PENDENTE', 'CONCLUIDA', 'CANCELADA'] })
  @IsOptional()
  @IsIn(['PENDENTE', 'CONCLUIDA', 'CANCELADA'])
  status?: 'PENDENTE' | 'CONCLUIDA' | 'CANCELADA';

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class AtualizarTarefasDto {
  @ApiProperty({ description: 'Lista de tarefas para atualizar', type: [AtualizarTarefaDto] })
  @IsArray()
  // Sem o ValidateNested, nada de cada item era conferido (nem a whitelist): `tarefa_id: null`
  // casava as linhas sem tarefa, e item sem tarefa_id casava todas (achado no SN-86)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AtualizarTarefaDto)
  tarefas: AtualizarTarefaDto[];
}