import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CondicaoOS, TipoOS, PrioridadeOS, OrigemOS } from '@prisma/client';

export class MaterialProgramacaoDto {
  @ApiProperty({ description: 'Descrição do material', example: 'Óleo lubrificante SAE 20W-50' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  descricao: string;

  @ApiProperty({ description: 'Quantidade planejada', example: 5.5 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantidade_planejada: number;

  @ApiProperty({ description: 'Unidade de medida', example: 'L' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  unidade: string;

  @ApiPropertyOptional({ description: 'Custo unitário', example: 15.50 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  custo_unitario?: number;
}

export class FerramentaProgramacaoDto {
  @ApiProperty({ description: 'Descrição da ferramenta', example: 'Chave inglesa 1/2"' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  descricao: string;

  @ApiProperty({ description: 'Quantidade necessária', example: 1 })
  @IsNumber()
  @Min(1)
  quantidade: number;
}

export class TecnicoProgramacaoDto {
  @ApiProperty({ description: 'Nome do técnico', example: 'João Silva' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  nome: string;

  @ApiProperty({ description: 'Especialidade', example: 'Mecânico' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  especialidade: string;

  @ApiProperty({ description: 'Horas estimadas', example: 4.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(24)
  horas_estimadas: number;

  @ApiPropertyOptional({ description: 'Custo por hora', example: 50.00 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  custo_hora?: number;

  @ApiPropertyOptional({ description: 'ID do técnico no sistema', example: 'clrx1234567890123456789012' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  tecnico_id?: string;
}

export class CreateProgramacaoDto {
  // Informações básicas
  @ApiProperty({ description: 'Descrição da programação', example: 'Manutenção preventiva do motor principal' })
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @ApiProperty({ description: 'Local da execução', example: 'Planta Industrial A - Setor 1' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  local: string;

  @ApiProperty({ description: 'Ativo/equipamento', example: 'Motor 001' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  ativo: string;

  @ApiProperty({ enum: CondicaoOS, description: 'Condição do equipamento' })
  @IsEnum(CondicaoOS)
  condicoes: CondicaoOS;

  @ApiProperty({ enum: TipoOS, description: 'Tipo da ordem de serviço' })
  @IsEnum(TipoOS)
  tipo: TipoOS;

  @ApiProperty({ enum: PrioridadeOS, description: 'Prioridade da execução', example: PrioridadeOS.MEDIA })
  @IsEnum(PrioridadeOS)
  prioridade: PrioridadeOS;

  @ApiProperty({ enum: OrigemOS, description: 'Origem da programação' })
  @IsEnum(OrigemOS)
  origem: OrigemOS;

  // Relacionamentos
  @ApiPropertyOptional({ description: 'ID da planta', example: 'clrx1234567890123456789012' })
  @IsOptional()
  @IsString()
  @Length(25, 26) // Aceitar 25 ou 26 por causa de IDs com espaços
  planta_id?: string;

  @ApiPropertyOptional({ description: 'ID da unidade', example: 'clrx1234567890123456789012' })
  @IsOptional()
  @IsString()
  @Length(25, 26) // Aceitar 25 ou 26 por causa de IDs com espaços
  unidade_id?: string;

  @ApiPropertyOptional({ description: 'ID do equipamento', example: 'clrx1234567890123456789012' })
  @IsOptional()
  @IsString()
  @Length(25, 26) // Aceitar 25 ou 26 por causa de IDs com espaços
  equipamento_id?: string;

  @ApiPropertyOptional({ description: 'ID da anomalia', example: 'clrx1234567890123456789012' })
  @IsOptional()
  @IsString()
  @Length(25, 26) // Aceitar 25 ou 26 por causa de IDs com espaços
  anomalia_id?: string;

  @ApiPropertyOptional({ description: 'ID do plano de manutenção', example: 'clrx1234567890123456789012' })
  @IsOptional()
  @IsString()
  @Length(25, 26) // Aceitar 25 ou 26 por causa de IDs com espaços
  plano_manutencao_id?: string;

  @ApiPropertyOptional({ description: 'Dados extras da origem' })
  @IsOptional()
  dados_origem?: any;

  // Array de IDs das tarefas (relacionamento N:N)
  @ApiPropertyOptional({
    description: 'IDs das tarefas associadas',
    example: ['clrx1234567890123456789012', 'clrx9876543210987654321098']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tarefas_ids?: string[];

  // Planejamento
  @ApiPropertyOptional({ description: 'Tempo estimado em horas (padrão: 2h)', example: 4.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  tempo_estimado?: number;

  @ApiPropertyOptional({ description: 'Duração estimada em horas (padrão: 3h ou 1.5x tempo_estimado)', example: 6.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  duracao_estimada?: number;

  @ApiPropertyOptional({ description: 'Data e hora de previsão de início', example: '2025-02-15T08:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_previsao_inicio?: string;

  @ApiPropertyOptional({ description: 'Data e hora de previsão de fim', example: '2025-02-15T17:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_previsao_fim?: string;

  // Programação inicial
  @ApiPropertyOptional({ description: 'Data e hora programada', example: '2025-02-15T08:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_hora_programada?: string;

  @ApiPropertyOptional({ description: 'Responsável pela execução', example: 'João Silva' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  responsavel?: string;

  @ApiPropertyOptional({ description: 'ID do responsável', example: 'clrx1234567890123456789012' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  responsavel_id?: string;

  @ApiPropertyOptional({ description: 'Time/equipe responsável', example: 'Equipe Elétrica' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  time_equipe?: string;

  // Requisitos de veículo
  @ApiPropertyOptional({ description: 'Necessita veículo', example: false })
  @IsOptional()
  @IsBoolean()
  necessita_veiculo?: boolean;

  @ApiPropertyOptional({ description: 'ID do veículo reservado', example: 'clrx1234567890123456789012' })
  @IsOptional()
  @IsString()
  @Length(25, 26)
  veiculo_id?: string;

  @ApiPropertyOptional({ description: 'Data de início da reserva', example: '2025-02-15' })
  @IsOptional()
  @IsDateString()
  reserva_data_inicio?: string;

  @ApiPropertyOptional({ description: 'Data de fim da reserva', example: '2025-02-15' })
  @IsOptional()
  @IsDateString()
  reserva_data_fim?: string;

  @ApiPropertyOptional({ description: 'Hora de início da reserva (HH:mm)', example: '08:00' })
  @IsOptional()
  @IsString()
  reserva_hora_inicio?: string;

  @ApiPropertyOptional({ description: 'Hora de fim da reserva (HH:mm)', example: '18:00' })
  @IsOptional()
  @IsString()
  reserva_hora_fim?: string;

  @ApiPropertyOptional({ description: 'Finalidade da reserva', example: 'Manutenção em planta remota' })
  @IsOptional()
  @IsString()
  reserva_finalidade?: string;

  @ApiPropertyOptional({ description: 'Assentos necessários', example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  assentos_necessarios?: number;

  @ApiPropertyOptional({ description: 'Carga necessária em kg', example: 500.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  carga_necessaria?: number;

  @ApiPropertyOptional({ description: 'Observações sobre veículo' })
  @IsOptional()
  @IsString()
  observacoes_veiculo?: string;

  // Recursos
  @ApiPropertyOptional({ description: 'Materiais necessários' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialProgramacaoDto)
  materiais?: MaterialProgramacaoDto[];

  @ApiPropertyOptional({ description: 'Ferramentas necessárias' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FerramentaProgramacaoDto)
  ferramentas?: FerramentaProgramacaoDto[];

  @ApiPropertyOptional({ description: 'Técnicos necessários' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TecnicoProgramacaoDto)
  tecnicos?: TecnicoProgramacaoDto[];

  // Custos
  @ApiPropertyOptional({ description: 'Orçamento previsto', example: 15000.00 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  orcamento_previsto?: number;

  // Observações
  @ApiPropertyOptional({ description: 'Observações gerais' })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Observações da programação' })
  @IsOptional()
  @IsString()
  observacoes_programacao?: string;

  @ApiPropertyOptional({ description: 'Justificativa da programação' })
  @IsOptional()
  @IsString()
  justificativa?: string;
}