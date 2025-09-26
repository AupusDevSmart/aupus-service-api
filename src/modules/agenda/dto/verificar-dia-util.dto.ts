import { IsDate, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerificarDiaUtilDto {
  @ApiProperty({
    description: 'Data para verificar se é dia útil',
    example: '2024-12-25',
    type: Date
  })
  @IsDate({ message: 'Data deve ser uma data válida' })
  @Type(() => Date)
  data: Date;

  @ApiPropertyOptional({
    description: 'ID da planta para verificar configurações específicas',
    example: 'plt_01234567890123456789012345'
  })
  @IsOptional()
  @IsString({ message: 'PlantaId deve ser uma string válida' })
  plantaId?: string;
}

export class ProximosDiasUteisDto {
  @ApiProperty({
    description: 'Quantidade de dias úteis a retornar',
    example: 5
  })
  @Type(() => Number)
  quantidade: number;

  @ApiPropertyOptional({
    description: 'Data de início para busca (padrão: hoje)',
    example: '2024-01-01',
    type: Date
  })
  @IsOptional()
  @IsDate({ message: 'Data de início deve ser uma data válida' })
  @Type(() => Date)
  dataInicio?: Date;

  @ApiPropertyOptional({
    description: 'ID da planta para verificar configurações específicas',
    example: 'plt_01234567890123456789012345'
  })
  @IsOptional()
  @IsString({ message: 'PlantaId deve ser uma string válida' })
  plantaId?: string;
}

export class AssociarPlantasDto {
  @ApiProperty({
    description: 'IDs das plantas a serem associadas',
    example: ['plt_01234567890123456789012345', 'plt_09876543210987654321098765'],
    type: [String]
  })
  @IsString({ each: true, message: 'Cada plantaId deve ser uma string válida' })
  plantaIds: string[];
}