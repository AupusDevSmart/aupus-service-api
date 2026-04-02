// src/modules/instrucoes/dto/create-sub-instrucao.dto.ts
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubInstrucaoDto {
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsBoolean()
  @IsOptional()
  obrigatoria?: boolean = false;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  tempo_estimado?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  ordem?: number;
}
