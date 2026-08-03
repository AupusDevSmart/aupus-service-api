// src/modules/planos-manutencao/dto/create-plano-manutencao.dto.ts
import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Cria um plano TEMPLATE, que pertence a uma categoria de equipamento.
 * As copias por equipamento nao passam por aqui: nascem em `vincularEquipamento`
 * a partir de um template.
 */
export class CreatePlanoManutencaoDto {
  @ApiProperty({ description: 'ID da categoria de equipamento a que o plano se aplica' })
  @IsString()
  @IsNotEmpty()
  categoria_id: string;

  @ApiProperty({ description: 'Nome do plano', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nome: string;

  @ApiPropertyOptional({ description: 'Descricao do plano' })
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiPropertyOptional({ description: 'Versao do plano', default: '1.0' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  versao?: string;

  @IsString()
  @IsOptional()
  criado_por?: string;
}
