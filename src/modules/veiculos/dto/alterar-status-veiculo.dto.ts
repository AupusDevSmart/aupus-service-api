import { IsEnum, IsOptional, IsString, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusVeiculo } from '@prisma/client';

export class AlterarStatusVeiculoDto {
  @ApiProperty({
    description: 'Novo status do veículo',
    enum: StatusVeiculo,
    example: StatusVeiculo.manutencao
  })
  @IsEnum(StatusVeiculo, { message: 'Status inválido' })
  novoStatus: StatusVeiculo;

  @ApiProperty({
    description: 'Motivo da alteração de status',
    example: 'Revisão programada dos 15.000 km'
  })
  @IsString({ message: 'Motivo deve ser uma string' })
  motivo: string;

  @ApiPropertyOptional({
    description: 'Data prevista de retorno (para manutenção)',
    example: '2025-01-25',
    type: Date
  })
  @IsDate({ message: 'Data de retorno deve ser uma data válida' })
  @Type(() => Date)
  @IsOptional()
  dataRetornoPrevista?: Date;

  @ApiPropertyOptional({
    description: 'Observações adicionais'
  })
  @IsString({ message: 'Observações devem ser uma string' })
  @IsOptional()
  observacoes?: string;
}