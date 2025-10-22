import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, IsJSON, Min, Max, Matches } from 'class-validator';

export enum TipoUnidade {
  UFV = 'UFV',
  Carga = 'Carga',
  Motor = 'Motor',
  Inversor = 'Inversor',
  Transformador = 'Transformador',
}

export class CreateUnidadeDto {
  @ApiProperty({
    description: 'ID da planta à qual a unidade pertence',
    example: 'plt_01234567890123456789012345',
  })
  @IsString()
  @IsNotEmpty({ message: 'ID da planta é obrigatório' })
  planta_id: string;

  @ApiProperty({
    description: 'Nome da unidade',
    example: 'Unidade Fotovoltaica 1',
  })
  @IsString()
  @IsNotEmpty({ message: 'Nome da unidade é obrigatório' })
  nome: string;

  @ApiProperty({
    description: 'Tipo da unidade',
    enum: TipoUnidade,
    example: TipoUnidade.UFV,
  })
  @IsEnum(TipoUnidade, { message: 'Tipo de unidade inválido' })
  @IsNotEmpty({ message: 'Tipo da unidade é obrigatório' })
  tipo: TipoUnidade;

  @ApiProperty({
    description: 'Estado (UF)',
    example: 'SP',
    minLength: 2,
    maxLength: 2,
  })
  @IsString()
  @IsNotEmpty({ message: 'Estado é obrigatório' })
  @Matches(/^[A-Z]{2}$/, { message: 'Estado deve conter 2 letras maiúsculas' })
  estado: string;

  @ApiProperty({
    description: 'Cidade',
    example: 'São Paulo',
  })
  @IsString()
  @IsNotEmpty({ message: 'Cidade é obrigatória' })
  cidade: string;

  @ApiProperty({
    description: 'Latitude (coordenada geográfica)',
    example: -23.5505,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber({}, { message: 'Latitude deve ser um número' })
  @Min(-90, { message: 'Latitude mínima é -90' })
  @Max(90, { message: 'Latitude máxima é 90' })
  latitude: number;

  @ApiProperty({
    description: 'Longitude (coordenada geográfica)',
    example: -46.6333,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber({}, { message: 'Longitude deve ser um número' })
  @Min(-180, { message: 'Longitude mínima é -180' })
  @Max(180, { message: 'Longitude máxima é 180' })
  longitude: number;

  @ApiProperty({
    description: 'Potência em kW',
    example: 1000.5,
    minimum: 0,
  })
  @IsNumber({}, { message: 'Potência deve ser um número' })
  @Min(0, { message: 'Potência não pode ser negativa' })
  potencia: number;

  @ApiProperty({
    description: 'Pontos de medição (array de strings em formato JSON)',
    example: ['Entrada', 'Saída', 'Transformador 1'],
    required: false,
  })
  @IsOptional()
  pontos_medicao?: string[];
}
