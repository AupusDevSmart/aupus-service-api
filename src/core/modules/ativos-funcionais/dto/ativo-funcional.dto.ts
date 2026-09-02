import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CriarAtivoFuncionalDto {
  @ApiProperty({ example: 'Inversor 1', description: 'O nome da POSICAO, nao do equipamento' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nome: string;

  @ApiProperty({ description: 'Categoria da posicao — o modelo do equipamento precisa pertencer a ela' })
  @IsString()
  @IsNotEmpty()
  categoria_id: string;

  @ApiProperty({ description: 'Instalacao onde a posicao existe' })
  @IsString()
  @IsNotEmpty()
  unidade_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  localizacao?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  localizacao_especifica?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class InstalarEquipamentoDto {
  @ApiProperty({ description: 'Equipamento a instalar nesta posicao' })
  @IsString()
  @IsNotEmpty()
  equipamento_id: string;
}

export class RemoverEquipamentoDto {
  @ApiPropertyOptional({ example: 'Queimou', description: 'Por que saiu — fica no historico da posicao' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

export class TransferirEquipamentoDto {
  @ApiProperty({ description: 'Posicao de destino' })
  @IsString()
  @IsNotEmpty()
  ativo_funcional_id: string;

  @ApiPropertyOptional({ example: 'Remanejado' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

export class ListarAtivosFuncionaisDto {
  @ApiPropertyOptional({ description: 'Filtra pelas posicoes de uma instalacao' })
  @IsOptional()
  @IsString()
  unidade_id?: string;
}
