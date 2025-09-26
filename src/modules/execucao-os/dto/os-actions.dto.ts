import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsArray,
  IsUUID,
  IsNotEmpty,
  Length,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReservaVeiculoDto {
  @ApiProperty({ description: 'ID do veículo' })
  @IsString()
  @Length(26, 26)
  veiculo_id: string;

  @ApiProperty({ description: 'Data de início da reserva', example: '2025-02-15' })
  @IsDateString()
  data_inicio: string;

  @ApiProperty({ description: 'Data de fim da reserva', example: '2025-02-15' })
  @IsDateString()
  data_fim: string;

  @ApiProperty({ description: 'Hora de início', example: '08:00' })
  @IsString()
  @Length(5, 5)
  hora_inicio: string;

  @ApiProperty({ description: 'Hora de fim', example: '17:00' })
  @IsString()
  @Length(5, 5)
  hora_fim: string;

  @ApiProperty({ description: 'Finalidade da reserva' })
  @IsString()
  @IsNotEmpty()
  finalidade: string;

  @ApiPropertyOptional({ description: 'KM inicial' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  km_inicial?: number;
}

export class ProgramarOSDto {
  @ApiProperty({ description: 'Data e hora programada', example: '2025-02-15T08:00:00Z' })
  @IsDateString()
  data_hora_programada: string;

  @ApiProperty({ description: 'Responsável pela execução' })
  @IsString()
  @IsNotEmpty()
  responsavel: string;

  @ApiPropertyOptional({ description: 'ID do responsável' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  responsavel_id?: string;

  @ApiPropertyOptional({ description: 'Time/equipe' })
  @IsOptional()
  @IsString()
  time_equipe?: string;

  @ApiProperty({ description: 'IDs dos materiais confirmados' })
  @IsArray()
  @IsString({ each: true })
  @Length(26, 26, { each: true })
  materiais_confirmados: string[];

  @ApiProperty({ description: 'IDs das ferramentas confirmadas' })
  @IsArray()
  @IsString({ each: true })
  @Length(26, 26, { each: true })
  ferramentas_confirmadas: string[];

  @ApiProperty({ description: 'IDs dos técnicos confirmados' })
  @IsArray()
  @IsString({ each: true })
  @Length(26, 26, { each: true })
  tecnicos_confirmados: string[];

  @ApiPropertyOptional({ description: 'Reserva de veículo' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReservaVeiculoDto)
  reserva_veiculo?: ReservaVeiculoDto;

  @ApiPropertyOptional({ description: 'Observações da programação' })
  @IsOptional()
  @IsString()
  observacoes_programacao?: string;
}

export class IniciarExecucaoDto {
  @ApiProperty({ description: 'Equipe presente na execução' })
  @IsArray()
  @IsString({ each: true })
  equipe_presente: string[];

  @ApiProperty({ description: 'Responsável pela execução' })
  @IsString()
  @IsNotEmpty()
  responsavel_execucao: string;

  @ApiPropertyOptional({ description: 'Observações do início' })
  @IsOptional()
  @IsString()
  observacoes_inicio?: string;

  @ApiPropertyOptional({ description: 'Data e hora de início real', example: '2025-02-15T08:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_hora_inicio_real?: string;
}

export class PausarExecucaoDto {
  @ApiProperty({ description: 'Motivo da pausa' })
  @IsString()
  @IsNotEmpty()
  motivo_pausa: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class RetomarExecucaoDto {
  @ApiPropertyOptional({ description: 'Observações da retomada' })
  @IsOptional()
  @IsString()
  observacoes_retomada?: string;
}

export class AtividadeChecklistDto {
  @ApiProperty({ description: 'ID da atividade' })
  @IsString()
  @Length(26, 26)
  id: string;

  @ApiProperty({ description: 'Atividade concluída' })
  @IsBoolean()
  concluida: boolean;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class AtualizarChecklistDto {
  @ApiProperty({ description: 'Lista de atividades', type: [AtividadeChecklistDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AtividadeChecklistDto)
  atividades: AtividadeChecklistDto[];
}

export class MaterialConsumoDto {
  @ApiProperty({ description: 'ID do material' })
  @IsString()
  @Length(26, 26)
  id: string;

  @ApiProperty({ description: 'Quantidade consumida' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantidade_consumida: number;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class RegistrarMateriaisDto {
  @ApiProperty({ description: 'Lista de materiais consumidos', type: [MaterialConsumoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialConsumoDto)
  materiais: MaterialConsumoDto[];
}

export class FerramentaUsoDto {
  @ApiProperty({ description: 'ID da ferramenta' })
  @IsString()
  @Length(26, 26)
  id: string;

  @ApiProperty({ description: 'Ferramenta utilizada' })
  @IsBoolean()
  utilizada: boolean;

  @ApiPropertyOptional({ description: 'Condição antes do uso' })
  @IsOptional()
  @IsString()
  condicao_antes?: string;

  @ApiPropertyOptional({ description: 'Condição depois do uso' })
  @IsOptional()
  @IsString()
  condicao_depois?: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class RegistrarFerramentasDto {
  @ApiProperty({ description: 'Lista de ferramentas utilizadas', type: [FerramentaUsoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FerramentaUsoDto)
  ferramentas: FerramentaUsoDto[];
}

export class ConcluirTarefaDto {
  @ApiPropertyOptional({ description: 'Observações da conclusão' })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Tempo de execução em minutos' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  tempo_execucao?: number;

  @ApiPropertyOptional({ description: 'Problemas encontrados' })
  @IsOptional()
  @IsString()
  problemas_encontrados?: string;

  @ApiPropertyOptional({ description: 'Quem concluiu a tarefa' })
  @IsOptional()
  @IsString()
  concluida_por?: string;
}

export class CancelarTarefaDto {
  @ApiProperty({ description: 'Motivo do cancelamento' })
  @IsString()
  @IsNotEmpty()
  motivo_cancelamento: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class MaterialFinalizacaoDto {
  @ApiProperty({ description: 'ID do material' })
  @IsString()
  @Length(26, 26)
  id: string;

  @ApiProperty({ description: 'Quantidade consumida final' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantidade_consumida: number;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class FerramentaFinalizacaoDto {
  @ApiProperty({ description: 'ID da ferramenta' })
  @IsString()
  @Length(26, 26)
  id: string;

  @ApiProperty({ description: 'Condição final da ferramenta' })
  @IsString()
  @IsNotEmpty()
  condicao_depois: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class FinalizarOSDto {
  @ApiPropertyOptional({ description: 'Data e hora de fim real', example: '2025-02-15T17:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_hora_fim_real?: string;

  @ApiProperty({ description: 'Resultado do serviço executado' })
  @IsString()
  @IsNotEmpty()
  resultado_servico: string;

  @ApiPropertyOptional({ description: 'Problemas encontrados durante a execução' })
  @IsOptional()
  @IsString()
  problemas_encontrados?: string;

  @ApiPropertyOptional({ description: 'Recomendações para futuras manutenções' })
  @IsOptional()
  @IsString()
  recomendacoes?: string;

  @ApiPropertyOptional({ description: 'Data sugerida para próxima manutenção', example: '2025-08-15' })
  @IsOptional()
  @IsDateString()
  proxima_manutencao?: string;

  @ApiProperty({ description: 'Materiais consumidos finais', type: [MaterialFinalizacaoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialFinalizacaoDto)
  materiais_consumidos: MaterialFinalizacaoDto[];

  @ApiProperty({ description: 'Ferramentas utilizadas finais', type: [FerramentaFinalizacaoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FerramentaFinalizacaoDto)
  ferramentas_utilizadas: FerramentaFinalizacaoDto[];

  @ApiProperty({ description: 'Avaliação da qualidade (1-5)' })
  @IsNumber()
  @Min(1)
  @Max(5)
  avaliacao_qualidade: number;

  @ApiPropertyOptional({ description: 'Observações sobre a qualidade' })
  @IsOptional()
  @IsString()
  observacoes_qualidade?: string;

  @ApiPropertyOptional({ description: 'KM final do veículo' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  km_final?: number;

  @ApiPropertyOptional({ description: 'Observações sobre o veículo' })
  @IsOptional()
  @IsString()
  observacoes_veiculo?: string;
}

export class CancelarOSDto {
  @ApiProperty({ description: 'Motivo do cancelamento' })
  @IsString()
  @IsNotEmpty()
  motivo_cancelamento: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class AdicionarAnexoDto {
  @ApiPropertyOptional({ description: 'Descrição do anexo' })
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiPropertyOptional({ description: 'Fase da execução', enum: ['antes', 'durante', 'depois'] })
  @IsOptional()
  @IsString()
  fase_execucao?: string;
}