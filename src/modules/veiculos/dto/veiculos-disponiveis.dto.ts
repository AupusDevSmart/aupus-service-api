import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoVeiculo } from '@prisma/client';

export class VeiculosDisponiveisDto {
  @ApiProperty({
    description: 'Data de início da verificação (YYYY-MM-DD)',
    example: '2025-01-20'
  })
  @IsString({ message: 'Data de início deve ser uma string' })
  @IsNotEmpty({ message: 'Data de início é obrigatória' })
  dataInicio: string;

  @ApiProperty({
    description: 'Data de fim da verificação (YYYY-MM-DD)',
    example: '2025-01-20'
  })
  @IsString({ message: 'Data de fim deve ser uma string' })
  @IsNotEmpty({ message: 'Data de fim é obrigatória' })
  dataFim: string;

  @ApiPropertyOptional({
    description: 'Hora de início (HH:mm)',
    example: '08:00',
    default: '00:00'
  })
  @IsString({ message: 'Hora de início deve ser uma string' })
  @IsOptional()
  horaInicio?: string = '00:00';

  @ApiPropertyOptional({
    description: 'Hora de fim (HH:mm)',
    example: '18:00',
    default: '23:59'
  })
  @IsString({ message: 'Hora de fim deve ser uma string' })
  @IsOptional()
  horaFim?: string = '23:59';

  @ApiPropertyOptional({
    description: 'Capacidade mínima de passageiros',
    example: 5
  })
  @IsInt({ message: 'Capacidade mínima deve ser um número inteiro' })
  @Min(1, { message: 'Capacidade mínima deve ser pelo menos 1' })
  @Type(() => Number)
  @IsOptional()
  capacidadeMinima?: number;

  @ApiPropertyOptional({
    description: 'Tipos de veículos permitidos',
    example: ['carro', 'van'],
    enum: TipoVeiculo,
    isArray: true
  })
  @IsArray({ message: 'Tipos de veículo deve ser um array' })
  @IsOptional()
  tiposVeiculo?: TipoVeiculo[];

  @ApiPropertyOptional({
    description: 'ID da reserva a excluir da verificação (para edição)'
  })
  @IsString({ message: 'ID da reserva deve ser uma string' })
  @IsOptional()
  excluirReservaId?: string;
}