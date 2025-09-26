import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsInt,
  IsDecimal,
  IsBoolean,
  IsDate,
  Length,
  Matches,
  Min,
  Max
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusVeiculo, TipoVeiculo, TipoCombustivel } from '@prisma/client';

export class CreateVeiculoDto {
  @ApiProperty({
    description: 'Nome identificador do veículo',
    example: 'Corolla Executivo'
  })
  @IsString({ message: 'Nome deve ser uma string' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @Length(2, 100, { message: 'Nome deve ter entre 2 e 100 caracteres' })
  nome: string;

  @ApiPropertyOptional({
    description: 'Código patrimonial interno',
    example: 'VEICULO-001'
  })
  @IsString({ message: 'Código patrimonial deve ser uma string' })
  @IsOptional()
  @Length(1, 50, { message: 'Código patrimonial deve ter até 50 caracteres' })
  codigoPatrimonial?: string;

  @ApiProperty({
    description: 'Placa do veículo no formato ABC-1234',
    example: 'ABC-1234'
  })
  @IsString({ message: 'Placa deve ser uma string' })
  @IsNotEmpty({ message: 'Placa é obrigatória' })
  @Matches(/^[A-Z]{3}-[0-9]{4}$/, {
    message: 'Placa deve estar no formato ABC-1234'
  })
  placa: string;

  @ApiProperty({
    description: 'Marca do veículo',
    example: 'Toyota'
  })
  @IsString({ message: 'Marca deve ser uma string' })
  @IsNotEmpty({ message: 'Marca é obrigatória' })
  @Length(1, 50, { message: 'Marca deve ter até 50 caracteres' })
  marca: string;

  @ApiProperty({
    description: 'Modelo do veículo',
    example: 'Corolla XEi'
  })
  @IsString({ message: 'Modelo deve ser uma string' })
  @IsNotEmpty({ message: 'Modelo é obrigatório' })
  @Length(1, 100, { message: 'Modelo deve ter até 100 caracteres' })
  modelo: string;

  @ApiProperty({
    description: 'Ano de fabricação',
    example: 2023
  })
  @IsInt({ message: 'Ano de fabricação deve ser um número inteiro' })
  @Min(1990, { message: 'Ano de fabricação deve ser maior que 1990' })
  @Max(new Date().getFullYear() + 1, { message: 'Ano de fabricação não pode ser superior ao próximo ano' })
  @Type(() => Number)
  anoFabricacao: number;

  @ApiPropertyOptional({
    description: 'Ano do modelo',
    example: 2023
  })
  @IsInt({ message: 'Ano do modelo deve ser um número inteiro' })
  @Min(1990, { message: 'Ano do modelo deve ser maior que 1990' })
  @Max(new Date().getFullYear() + 1, { message: 'Ano do modelo não pode ser superior ao próximo ano' })
  @Type(() => Number)
  @IsOptional()
  anoModelo?: number;

  @ApiPropertyOptional({
    description: 'Cor do veículo',
    example: 'Prata'
  })
  @IsString({ message: 'Cor deve ser uma string' })
  @IsOptional()
  @Length(1, 30, { message: 'Cor deve ter até 30 caracteres' })
  cor?: string;

  @ApiPropertyOptional({
    description: 'Número do chassi (17 caracteres)',
    example: '9BR53ZEC1P4123456'
  })
  @IsString({ message: 'Chassi deve ser uma string' })
  @IsOptional()
  @Length(17, 17, { message: 'Chassi deve ter exatamente 17 caracteres' })
  chassi?: string;

  @ApiPropertyOptional({
    description: 'Número do RENAVAM (11 dígitos)',
    example: '12345678901'
  })
  @IsString({ message: 'RENAVAM deve ser uma string' })
  @IsOptional()
  @Matches(/^[0-9]{11}$/, { message: 'RENAVAM deve ter exatamente 11 dígitos' })
  renavam?: string;

  @ApiProperty({
    description: 'Tipo do veículo',
    enum: TipoVeiculo,
    example: TipoVeiculo.carro
  })
  @IsEnum(TipoVeiculo, { message: 'Tipo de veículo inválido' })
  tipo: TipoVeiculo;

  @ApiProperty({
    description: 'Tipo de combustível',
    enum: TipoCombustivel,
    example: TipoCombustivel.flex
  })
  @IsEnum(TipoCombustivel, { message: 'Tipo de combustível inválido' })
  tipoCombustivel: TipoCombustivel;

  @ApiProperty({
    description: 'Capacidade de passageiros',
    example: 5
  })
  @IsInt({ message: 'Capacidade de passageiros deve ser um número inteiro' })
  @Min(1, { message: 'Capacidade de passageiros deve ser pelo menos 1' })
  @Type(() => Number)
  capacidadePassageiros: number;

  @ApiProperty({
    description: 'Capacidade de carga em kg',
    example: 500.0
  })
  @Transform(({ value }) => parseFloat(value))
  @Min(0, { message: 'Capacidade de carga deve ser maior ou igual a 0' })
  capacidadeCarga: number;

  @ApiPropertyOptional({
    description: 'Autonomia média em km/l',
    example: 12.5
  })
  @Transform(({ value }) => value ? parseFloat(value) : undefined)
  @Min(0, { message: 'Autonomia média deve ser maior que 0' })
  @IsOptional()
  autonomiaMedia?: number;

  @ApiProperty({
    description: 'Localização atual do veículo',
    example: 'Garagem Principal'
  })
  @IsString({ message: 'Localização atual deve ser uma string' })
  @IsNotEmpty({ message: 'Localização atual é obrigatória' })
  @Length(1, 200, { message: 'Localização atual deve ter até 200 caracteres' })
  localizacaoAtual: string;

  @ApiPropertyOptional({
    description: 'Valor de aquisição',
    example: 85000.00
  })
  @Transform(({ value }) => value ? parseFloat(value) : undefined)
  @Min(0, { message: 'Valor de aquisição deve ser maior que 0' })
  @IsOptional()
  valorAquisicao?: number;

  @ApiPropertyOptional({
    description: 'Data de aquisição',
    example: '2023-01-15',
    type: Date
  })
  @IsDate({ message: 'Data de aquisição deve ser uma data válida' })
  @Type(() => Date)
  @IsOptional()
  dataAquisicao?: Date;

  @ApiProperty({
    description: 'Responsável pelo veículo',
    example: 'João Silva'
  })
  @IsString({ message: 'Responsável deve ser uma string' })
  @IsNotEmpty({ message: 'Responsável é obrigatório' })
  @Length(1, 100, { message: 'Responsável deve ter até 100 caracteres' })
  responsavel: string;

  @ApiPropertyOptional({
    description: 'ID do usuário responsável',
    example: 'usr_01234567890123456789012345'
  })
  @IsString({ message: 'ID do responsável deve ser uma string' })
  @IsOptional()
  responsavelId?: string;

  @ApiPropertyOptional({
    description: 'Observações adicionais',
    example: 'Veículo executivo para diretoria'
  })
  @IsString({ message: 'Observações devem ser uma string' })
  @IsOptional()
  observacoes?: string;

  @ApiPropertyOptional({
    description: 'URL ou base64 da foto do veículo'
  })
  @IsString({ message: 'Foto deve ser uma string' })
  @IsOptional()
  foto?: string;

  @ApiPropertyOptional({
    description: 'ID da planta'
  })
  @IsString({ message: 'ID da planta deve ser uma string' })
  @IsOptional()
  plantaId?: string;

  @ApiPropertyOptional({
    description: 'ID do proprietário'
  })
  @IsString({ message: 'ID do proprietário deve ser uma string' })
  @IsOptional()
  proprietarioId?: string;

  @ApiPropertyOptional({
    description: 'Quilometragem inicial',
    example: 0
  })
  @IsInt({ message: 'Quilometragem deve ser um número inteiro' })
  @Min(0, { message: 'Quilometragem deve ser maior ou igual a 0' })
  @Type(() => Number)
  @IsOptional()
  quilometragem?: number;

  @ApiPropertyOptional({
    description: 'Data da próxima revisão',
    type: Date
  })
  @IsDate({ message: 'Data da próxima revisão deve ser uma data válida' })
  @Type(() => Date)
  @IsOptional()
  proximaRevisao?: Date;

  @ApiPropertyOptional({
    description: 'Data da última revisão',
    type: Date
  })
  @IsDate({ message: 'Data da última revisão deve ser uma data válida' })
  @Type(() => Date)
  @IsOptional()
  ultimaRevisao?: Date;
}