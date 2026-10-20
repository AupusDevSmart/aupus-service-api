import { IsEnum, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoDocumentacaoVeiculo } from '@/core';
import { DiaComoData } from '@/common/decorators/dia-de-calendario';

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

  // Obrigatória: a coluna é NOT NULL, e sem ela o Prisma recusava (500). A tela
  // sempre manda (padrão: daqui a um ano)
  @ApiProperty({
    description: 'Data de vencimento',
    example: '2025-12-31',
    type: Date
  })
  @DiaComoData({ obrigatoria: true })
  dataVencimento: Date;

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