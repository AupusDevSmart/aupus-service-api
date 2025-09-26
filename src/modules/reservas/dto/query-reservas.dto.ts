import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusReserva, TipoSolicitante } from '@prisma/client';

export class QueryReservasDto {
  @ApiPropertyOptional({
    description: 'Página',
    example: 1,
    minimum: 1
  })
  @IsInt({ message: 'Página deve ser um número inteiro' })
  @Min(1, { message: 'Página deve ser pelo menos 1' })
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Itens por página',
    example: 20,
    minimum: 1,
    maximum: 100
  })
  @IsInt({ message: 'Limite deve ser um número inteiro' })
  @Min(1, { message: 'Limite deve ser pelo menos 1' })
  @Max(100, { message: 'Limite deve ser no máximo 100' })
  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Busca por responsável, finalidade, nome ou placa do veículo'
  })
  @IsString({ message: 'Busca deve ser uma string' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por status',
    enum: StatusReserva
  })
  @IsEnum(StatusReserva, { message: 'Status inválido' })
  @IsOptional()
  status?: StatusReserva;

  @ApiPropertyOptional({
    description: 'Filtrar por veículo'
  })
  @IsString({ message: 'ID do veículo deve ser uma string' })
  @IsOptional()
  veiculoId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por responsável'
  })
  @IsString({ message: 'Responsável deve ser uma string' })
  @IsOptional()
  responsavel?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de solicitante',
    enum: TipoSolicitante
  })
  @IsEnum(TipoSolicitante, { message: 'Tipo de solicitante inválido' })
  @IsOptional()
  tipoSolicitante?: TipoSolicitante;

  @ApiPropertyOptional({
    description: 'Data de início mínima (YYYY-MM-DD)',
    example: '2025-01-20'
  })
  @IsString({ message: 'Data de início deve ser uma string' })
  @IsOptional()
  dataInicio?: string;

  @ApiPropertyOptional({
    description: 'Data de fim máxima (YYYY-MM-DD)',
    example: '2025-01-25'
  })
  @IsString({ message: 'Data de fim deve ser uma string' })
  @IsOptional()
  dataFim?: string;

  @ApiPropertyOptional({
    description: 'Campo para ordenação',
    enum: ['responsavel', 'dataInicio', 'dataFim', 'status', 'finalidade', 'criadoEm'],
    example: 'criadoEm'
  })
  @IsString({ message: 'Campo de ordenação deve ser uma string' })
  @IsOptional()
  orderBy?: string;

  @ApiPropertyOptional({
    description: 'Direção da ordenação',
    enum: ['asc', 'desc'],
    example: 'desc'
  })
  @IsEnum(['asc', 'desc'], { message: 'Direção deve ser "asc" ou "desc"' })
  @IsOptional()
  orderDirection?: 'asc' | 'desc';
}