import { IsOptional, IsEnum, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { StatusPlano } from '@prisma/client';

export class QueryPlanosPorPlantaDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  incluir_tarefas?: boolean = false;

  @IsOptional()
  @IsEnum(StatusPlano)
  status?: StatusPlano = StatusPlano.ATIVO;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}