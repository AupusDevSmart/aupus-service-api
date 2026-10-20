import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsIn, IsString, IsNumber, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { StatusSolicitacaoServico, TipoSolicitacaoServico, PrioridadeSolicitacao, OrigemSolicitacao } from '@/core';
import { DiaOuInstante } from '@/common/decorators/instante';

export class SolicitacaoFiltersDto {
  @ApiPropertyOptional({ description: 'Página atual', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Itens por página', minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  // Sem teto, ?limit=1000000 trazia a tabela inteira e fazia duas consultas por
  // linha (revisão do SN-74), como nas OS e programações
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Busca por texto (título, descrição, local)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por status', enum: StatusSolicitacaoServico })
  @IsOptional()
  @IsEnum(StatusSolicitacaoServico)
  status?: StatusSolicitacaoServico;

  @ApiPropertyOptional({ description: 'Filtrar por tipo', enum: TipoSolicitacaoServico })
  @IsOptional()
  @IsEnum(TipoSolicitacaoServico)
  tipo?: TipoSolicitacaoServico;

  @ApiPropertyOptional({ description: 'Filtrar por prioridade', enum: PrioridadeSolicitacao })
  @IsOptional()
  @IsEnum(PrioridadeSolicitacao)
  prioridade?: PrioridadeSolicitacao;

  @ApiPropertyOptional({ description: 'Filtrar por origem', enum: OrigemSolicitacao })
  @IsOptional()
  @IsEnum(OrigemSolicitacao)
  origem?: OrigemSolicitacao;

  @ApiPropertyOptional({ description: 'Filtrar por planta' })
  @IsOptional()
  @IsString()
  planta_id?: string;

  @ApiPropertyOptional({ description: 'Filtrar por unidade' })
  @IsOptional()
  @IsString()
  unidade_id?: string;

  @ApiPropertyOptional({ description: 'Filtrar por proprietário' })
  @IsOptional()
  @IsString()
  proprietario_id?: string;

  @ApiPropertyOptional({ description: 'Filtrar por equipamento' })
  @IsOptional()
  @IsString()
  equipamento_id?: string;

  @ApiPropertyOptional({ description: 'Filtrar por departamento' })
  @IsOptional()
  @IsString()
  departamento?: string;

  @ApiPropertyOptional({ description: 'Filtrar por solicitante' })
  @IsOptional()
  @IsString()
  solicitante_nome?: string;

  @ApiPropertyOptional({ description: 'Data inicial (formato ISO 8601)' })
  @IsOptional()
  @DiaOuInstante()
  data_inicio?: string;

  @ApiPropertyOptional({ description: 'Data final (formato ISO 8601)' })
  @IsOptional()
  @DiaOuInstante()
  data_fim?: string;

  @ApiPropertyOptional({
    description: 'Ordenar por campo',
    enum: ['data_solicitacao', 'prioridade', 'status', 'titulo'],
    default: 'data_solicitacao'
  })
  // Lista fechada: outra coluna ia direto ao orderBy e o Prisma recusava (500)
  @IsOptional()
  @IsIn(['data_solicitacao', 'prioridade', 'status', 'titulo'])
  sortBy?: string = 'data_solicitacao';

  @ApiPropertyOptional({
    description: 'Direção da ordenação',
    enum: ['asc', 'desc'],
    default: 'desc'
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}