import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsEnum, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusVeiculo, TipoVeiculo, TipoCombustivel } from '@prisma/client';

export class QueryVeiculosDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, description: 'Página atual' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100, description: 'Itens por página' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'corolla', description: 'Buscar por nome, placa, marca ou modelo' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: StatusVeiculo.disponivel,
    enum: StatusVeiculo,
    description: 'Filtrar por status do veículo'
  })
  @IsOptional()
  @IsEnum(StatusVeiculo)
  status?: StatusVeiculo;

  @ApiPropertyOptional({
    example: TipoVeiculo.carro,
    enum: TipoVeiculo,
    description: 'Filtrar por tipo de veículo'
  })
  @IsOptional()
  @IsEnum(TipoVeiculo)
  tipo?: TipoVeiculo;

  @ApiPropertyOptional({
    example: TipoCombustivel.flex,
    enum: TipoCombustivel,
    description: 'Filtrar por tipo de combustível'
  })
  @IsOptional()
  @IsEnum(TipoCombustivel)
  tipoCombustivel?: TipoCombustivel;

  @ApiPropertyOptional({
    example: 'plt_01234567890123456789012345',
    description: 'Filtrar por ID da planta'
  })
  @IsOptional()
  @IsString()
  plantaId?: string;

  @ApiPropertyOptional({
    example: 'João Silva',
    description: 'Filtrar por responsável'
  })
  @IsOptional()
  @IsString()
  responsavel?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar apenas veículos ativos'
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  ativo?: boolean = true;

  @ApiPropertyOptional({
    example: 'Toyota',
    description: 'Filtrar por marca'
  })
  @IsOptional()
  @IsString()
  marca?: string;

  @ApiPropertyOptional({
    example: 2023,
    description: 'Filtrar por ano de fabricação'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  anoFabricacao?: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Capacidade mínima de passageiros'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacidadeMinima?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Incluir apenas veículos disponíveis (sem reservas ativas)'
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  apenasDisponiveis?: boolean;

  @ApiPropertyOptional({
    example: 'nome',
    enum: ['nome', 'placa', 'marca', 'modelo', 'anoFabricacao', 'quilometragem', 'criadoEm'],
    description: 'Campo para ordenação'
  })
  @IsOptional()
  @IsString()
  @IsIn(['nome', 'placa', 'marca', 'modelo', 'anoFabricacao', 'quilometragem', 'criadoEm'])
  orderBy?: string = 'criadoEm';

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  orderDirection?: 'asc' | 'desc' = 'desc';
}