// src/modules/plantas/dto/update-planta.dto.ts - CORRIGIDO
import { 
  IsOptional, 
  IsString, 
  Length, 
  IsNotEmpty, 
  ValidateNested,
  Matches
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TextoOpcional } from '@/common/decorators/texto';

// ✅ NOVO: DTO específico para endereço parcial no update
export class UpdateEnderecoDto {
  @ApiPropertyOptional({ 
    description: 'Logradouro', 
    example: 'Av. Industrial, 1000'
  })
  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'Logradouro deve ser uma string' })
  @Length(1, 200, { message: 'Logradouro deve ter até 200 caracteres' })
  logradouro?: string | null;

  @ApiPropertyOptional({ 
    description: 'Bairro', 
    example: 'Centro'
  })
  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'Bairro deve ser uma string' })
  @Length(1, 100, { message: 'Bairro deve ter até 100 caracteres' })
  bairro?: string | null;

  @ApiPropertyOptional({ 
    description: 'Cidade', 
    example: 'São Paulo'
  })
  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'Cidade deve ser uma string' })
  @Length(1, 100, { message: 'Cidade deve ter até 100 caracteres' })
  cidade?: string | null;

  @ApiPropertyOptional({ 
    description: 'UF', 
    example: 'SP'
  })
  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'UF deve ser uma string' })
  @Length(2, 2, { message: 'UF deve ter exatamente 2 caracteres' })
  uf?: string | null;

  @ApiPropertyOptional({ 
    description: 'CEP', 
    example: '01234-567'
  })
  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'CEP deve ser uma string' })
  @Matches(/^\d{5}-\d{3}$/, {
    message: 'CEP deve estar no formato XXXXX-XXX'
  })
  cep?: string | null;
}

export class UpdatePlantaDto {
  @ApiPropertyOptional({
    description: 'Nome da planta',
    example: 'Planta Industrial São Paulo - Atualizada'
  })
  @IsOptional()
  @IsString({ message: 'Nome deve ser uma string' })
  @IsNotEmpty({ message: 'Nome não pode estar vazio' })
  @Length(2, 100, { message: 'Nome deve ter entre 2 e 100 caracteres' })
  nome?: string;

  @ApiPropertyOptional({
    description: 'Número da Unidade Consumidora',
    example: '123456789'
  })
  @IsOptional()
  @IsString({ message: 'Número UC deve ser uma string' })
  @Length(1, 255, { message: 'Número UC deve ter entre 1 e 255 caracteres' })
  numero_uc?: string;

  @ApiPropertyOptional({
    description: 'CNPJ da planta',
    example: '12.345.678/0001-90'
  })
  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'CNPJ deve ser uma string' })
  @Matches(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, {
    message: 'CNPJ deve estar no formato XX.XXX.XXX/XXXX-XX'
  })
  cnpj?: string | null;

  @ApiPropertyOptional({ 
    description: 'ID do proprietário da planta', 
    example: 'usr_proprietario_123456789012345678'
  })
  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'ProprietarioId deve ser uma string' })
  proprietarioId?: string | null;

  @ApiPropertyOptional({ 
    description: 'Horário de funcionamento da planta', 
    example: '08:00 às 18:00'
  })
  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'Horário de funcionamento deve ser uma string' })
  @Length(1, 50, { message: 'Horário de funcionamento deve ter até 50 caracteres' })
  horarioFuncionamento?: string | null;

  @ApiPropertyOptional({ 
    description: 'Localização específica da planta', 
    example: 'Zona Sul - Galpão 2'
  })
  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'Localização deve ser uma string' })
  @Length(1, 200, { message: 'Localização deve ter até 200 caracteres' })
  localizacao?: string | null;

  @ApiPropertyOptional({ 
    description: 'Endereço completo da planta',
    type: UpdateEnderecoDto
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEnderecoDto)
  endereco?: UpdateEnderecoDto;
}