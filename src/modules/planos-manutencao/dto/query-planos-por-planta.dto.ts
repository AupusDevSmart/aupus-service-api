import { IsOptional, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { BooleanoDoTexto } from '@/common/decorators/booleano';

export class QueryPlanosPorPlantaDto {
  @IsOptional()
  @BooleanoDoTexto()
  @IsBoolean()
  incluir_tarefas?: boolean = false;

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