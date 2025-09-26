import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDate,
  Matches
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoSolicitante } from '@prisma/client';

export class CreateReservaDto {
  @ApiProperty({
    description: 'ID do veículo a ser reservado',
    example: 'vei_01234567890123456789012345'
  })
  @IsString({ message: 'ID do veículo deve ser uma string' })
  @IsNotEmpty({ message: 'ID do veículo é obrigatório' })
  veiculoId: string;

  @ApiPropertyOptional({
    description: 'ID do solicitante (OS, viagem, etc)',
    example: 'OS-2025-001'
  })
  @IsString({ message: 'ID do solicitante deve ser uma string' })
  @IsOptional()
  solicitanteId?: string;

  @ApiProperty({
    description: 'Tipo de solicitante',
    enum: TipoSolicitante,
    example: TipoSolicitante.ordem_servico
  })
  @IsEnum(TipoSolicitante, { message: 'Tipo de solicitante inválido' })
  tipoSolicitante: TipoSolicitante;

  @ApiProperty({
    description: 'Data de início da reserva',
    example: '2025-01-20',
    type: Date
  })
  @IsDate({ message: 'Data de início deve ser uma data válida' })
  @Type(() => Date)
  dataInicio: Date;

  @ApiProperty({
    description: 'Data de fim da reserva',
    example: '2025-01-20',
    type: Date
  })
  @IsDate({ message: 'Data de fim deve ser uma data válida' })
  @Type(() => Date)
  dataFim: Date;

  @ApiProperty({
    description: 'Hora de início (HH:mm)',
    example: '08:00'
  })
  @IsString({ message: 'Hora de início deve ser uma string' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Hora de início deve estar no formato HH:mm'
  })
  horaInicio: string;

  @ApiProperty({
    description: 'Hora de fim (HH:mm)',
    example: '18:00'
  })
  @IsString({ message: 'Hora de fim deve ser uma string' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Hora de fim deve estar no formato HH:mm'
  })
  horaFim: string;

  @ApiProperty({
    description: 'Nome do responsável pela reserva',
    example: 'Maria Santos'
  })
  @IsString({ message: 'Responsável deve ser uma string' })
  @IsNotEmpty({ message: 'Responsável é obrigatório' })
  responsavel: string;

  @ApiPropertyOptional({
    description: 'ID do usuário responsável'
  })
  @IsString({ message: 'ID do responsável deve ser uma string' })
  @IsOptional()
  responsavelId?: string;

  @ApiProperty({
    description: 'Finalidade da reserva',
    example: 'Execução de OS de manutenção'
  })
  @IsString({ message: 'Finalidade deve ser uma string' })
  @IsNotEmpty({ message: 'Finalidade é obrigatória' })
  finalidade: string;

  @ApiPropertyOptional({
    description: 'Observações adicionais',
    example: 'Levar equipamentos específicos'
  })
  @IsString({ message: 'Observações devem ser uma string' })
  @IsOptional()
  observacoes?: string;

  @ApiPropertyOptional({
    description: 'Nome de quem está criando a reserva'
  })
  @IsString({ message: 'Criado por deve ser uma string' })
  @IsOptional()
  criadoPor?: string;

  @ApiPropertyOptional({
    description: 'ID de quem está criando a reserva'
  })
  @IsString({ message: 'ID do criador deve ser uma string' })
  @IsOptional()
  criadoPorId?: string;
}