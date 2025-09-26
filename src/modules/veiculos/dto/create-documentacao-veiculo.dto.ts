import { IsEnum, IsString, IsNotEmpty, IsOptional, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoDocumentacaoVeiculo } from '@prisma/client';

export class CreateDocumentacaoVeiculoDto {
  @ApiProperty({
    description: 'Tipo de documentação',
    enum: TipoDocumentacaoVeiculo,
    example: TipoDocumentacaoVeiculo.ipva
  })
  @IsEnum(TipoDocumentacaoVeiculo, { message: 'Tipo de documentação inválido' })
  tipo: TipoDocumentacaoVeiculo;

  @ApiProperty({
    description: 'Descrição da documentação',
    example: 'CRLV 2025'
  })
  @IsString({ message: 'Descrição deve ser uma string' })
  @IsNotEmpty({ message: 'Descrição é obrigatória' })
  descricao: string;

  @ApiPropertyOptional({
    description: 'Data de vencimento',
    example: '2025-12-31',
    type: Date
  })
  @IsDate({ message: 'Data de vencimento deve ser uma data válida' })
  @Type(() => Date)
  @IsOptional()
  dataVencimento?: Date;

  @ApiPropertyOptional({
    description: 'Número do documento',
    example: '123456789'
  })
  @IsString({ message: 'Número do documento deve ser uma string' })
  @IsOptional()
  numeroDocumento?: string;

  @ApiPropertyOptional({
    description: 'Órgão emissor',
    example: 'DETRAN-SP'
  })
  @IsString({ message: 'Órgão emissor deve ser uma string' })
  @IsOptional()
  orgaoEmissor?: string;

  @ApiPropertyOptional({
    description: 'Observações adicionais'
  })
  @IsString({ message: 'Observações devem ser uma string' })
  @IsOptional()
  observacoes?: string;

  @ApiPropertyOptional({
    description: 'Nome de quem está criando a documentação'
  })
  @IsString({ message: 'Criado por deve ser uma string' })
  @IsOptional()
  criadoPor?: string;

  @ApiPropertyOptional({
    description: 'ID de quem está criando a documentação'
  })
  @IsString({ message: 'ID do criador deve ser uma string' })
  @IsOptional()
  criadoPorId?: string;
}