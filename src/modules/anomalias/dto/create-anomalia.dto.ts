// src/modules/anomalias/dto/create-anomalia.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum StatusAnomalia {
  AGUARDANDO = 'AGUARDANDO',
  EM_ANALISE = 'EM_ANALISE',
  OS_GERADA = 'OS_GERADA',
  CANCELADA = 'CANCELADA',
  RESOLVIDA = 'RESOLVIDA',
}

export enum PrioridadeAnomalia {
  BAIXA = 'BAIXA',
  MEDIA = 'MEDIA',
  ALTA = 'ALTA',
  CRITICA = 'CRITICA',
}

export enum CondicaoAnomalia {
  PARADO = 'PARADO',
  FUNCIONANDO = 'FUNCIONANDO',
  RISCO_ACIDENTE = 'RISCO_ACIDENTE',
}

export enum OrigemAnomalia {
  SCADA = 'SCADA',
  OPERADOR = 'OPERADOR',
  FALHA = 'FALHA',
}

class LocalizacaoDto {
  @ApiProperty({ description: 'ID do equipamento' })
  @IsOptional()
  @IsString()
  equipamentoId?: string;

  @ApiProperty({ description: 'Local da anomalia' })
  @IsString()
  @IsNotEmpty()
  local: string;

  @ApiProperty({ description: 'Ativo afetado' })
  @IsString()
  @IsNotEmpty()
  ativo: string;
}

export class CreateAnomaliaDto {
  @ApiProperty({
    description: 'Descrição detalhada da anomalia',
    example: 'Vazamento de óleo no mancal do motor principal'
  })
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @ApiProperty({
    description: 'Dados de localização da anomalia',
    type: LocalizacaoDto
  })
  @ValidateNested()
  @Type(() => LocalizacaoDto)
  localizacao: LocalizacaoDto;

  @ApiProperty({
    description: 'Condição atual do equipamento',
    enum: CondicaoAnomalia,
    example: CondicaoAnomalia.FUNCIONANDO
  })
  @IsEnum(CondicaoAnomalia)
  condicao: CondicaoAnomalia;

  @ApiProperty({
    description: 'Origem da identificação da anomalia',
    enum: OrigemAnomalia,
    example: OrigemAnomalia.OPERADOR
  })
  @IsEnum(OrigemAnomalia)
  origem: OrigemAnomalia;

  @ApiProperty({
    description: 'Prioridade da anomalia',
    enum: PrioridadeAnomalia,
    example: PrioridadeAnomalia.MEDIA
  })
  @IsEnum(PrioridadeAnomalia)
  prioridade: PrioridadeAnomalia;

  @ApiProperty({
    description: 'Observações adicionais',
    required: false,
    example: 'Observado durante inspeção de rotina'
  })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiProperty({
    description: 'Anexos (arquivos)',
    type: 'array',
    items: { type: 'string', format: 'binary' },
    required: false
  })
  @IsOptional()
  @IsArray()
  anexos?: any[];
}