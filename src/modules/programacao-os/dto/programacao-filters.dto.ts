import { IsOptional, IsEnum, IsString, IsNumber, Min, Length, MaxLength, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusProgramacaoOS, TipoOS, PrioridadeOS, OrigemOS } from '@/core';
import { DiaOuInstante } from '@/common/decorators/instante';

export class ProgramacaoFiltersDto {
  @ApiPropertyOptional({ description: 'Página', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items por página', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  // A tela pede até 100; sem teto, ?limit=100000 trazia a tabela inteira com os includes
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Busca em descrição, local, ativo' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: StatusProgramacaoOS, description: 'Status da programação' })
  @IsOptional()
  @IsEnum({ ...StatusProgramacaoOS, all: 'all' })
  status?: StatusProgramacaoOS | 'all';

  @ApiPropertyOptional({ enum: TipoOS, description: 'Tipo da OS' })
  @IsOptional()
  @IsEnum({ ...TipoOS, all: 'all' })
  tipo?: TipoOS | 'all';

  @ApiPropertyOptional({ enum: PrioridadeOS, description: 'Prioridade' })
  @IsOptional()
  @IsEnum({ ...PrioridadeOS, all: 'all' })
  prioridade?: PrioridadeOS | 'all';

  @ApiPropertyOptional({ enum: OrigemOS, description: 'Origem' })
  @IsOptional()
  @IsEnum({ ...OrigemOS, all: 'all' })
  origem?: OrigemOS | 'all';

  @ApiPropertyOptional({ description: 'ID da planta' })
  @IsOptional()
  @IsString()
  // Sem @Length(26): ids antigos têm 25 caracteres (cuid); o service casa as duas formas
  @MaxLength(26)
  planta_id?: string;

  @ApiPropertyOptional({ description: 'O equipamento e os componentes dele, pela regra da instalação da OS (tarefa, anomalia, solicitação)' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  equipamento_id?: string;

  @ApiPropertyOptional({ description: 'ID da unidade' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  unidade_id?: string;

  @ApiPropertyOptional({ description: 'Data de início do filtro', example: '2025-01-01' })
  @IsOptional()
  @DiaOuInstante()
  data_inicio?: string;

  @ApiPropertyOptional({ description: 'Data de fim do filtro', example: '2025-12-31' })
  @IsOptional()
  @DiaOuInstante()
  data_fim?: string;

  // Sem @Length(26): ids antigos de anomalia tem 25 caracteres (cuid).
  @ApiPropertyOptional({ description: 'Programações desta anomalia (atalho "Ver programação")' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  anomalia_id?: string;

  @ApiPropertyOptional({ description: 'Programações desta solicitação (atalho "Ver programação")' })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  solicitacao_servico_id?: string;

  @ApiPropertyOptional({ description: 'ID do criador' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  criado_por_id?: string;
}