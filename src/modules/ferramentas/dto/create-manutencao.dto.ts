// ===============================
// src/modules/ferramentas/dto/create-manutencao.dto.ts
// ===============================
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEnum,
  IsDecimal,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TipoManutencao {
  PREVENTIVA = 'preventiva',
  CORRETIVA = 'corretiva',
  CALIBRACAO = 'calibracao',
}

export enum StatusManutencao {
  EM_ANDAMENTO = 'em_andamento',
  CONCLUIDA = 'concluida',
  CANCELADA = 'cancelada',
}

export class CreateManutencaoDto {
  @ApiProperty({ enum: TipoManutencao })
  @IsEnum(TipoManutencao)
  tipo_manutencao: TipoManutencao;

  @ApiProperty({ example: '2024-09-18T08:00:00Z' })
  @IsDateString()
  data_inicio: string;

  @ApiPropertyOptional({ example: '2024-09-18T12:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_fim?: string;

  @ApiProperty({ enum: StatusManutencao, example: StatusManutencao.EM_ANDAMENTO })
  @IsEnum(StatusManutencao)
  status_manutencao: StatusManutencao;

  @ApiProperty({ example: 'Reparo do display que apresentou falha' })
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @ApiPropertyOptional({ example: 'Substituição do módulo LCD' })
  @IsOptional()
  @IsString()
  solucao?: string;

  @ApiPropertyOptional({ example: 250.00 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '2' })
  @Transform(({ value }) => value ? parseFloat(value) : null)
  custo?: number;

  @ApiPropertyOptional({ example: 'TecService Eletrônicos' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fornecedor?: string;
}