import { IsString, IsOptional, IsNumber, IsEnum, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum PortaEnum {
  TOP = 'top',
  BOTTOM = 'bottom',
  LEFT = 'left',
  RIGHT = 'right',
}

enum TipoLinhaEnum {
  SOLIDA = 'solida',
  TRACEJADA = 'tracejada',
  PONTILHADA = 'pontilhada',
}

class PortaDto {
  @ApiProperty({ description: 'ID do equipamento', example: 'equip_001' })
  @IsString()
  equipamentoId: string;

  @ApiProperty({ description: 'Porta do equipamento', enum: PortaEnum, example: 'right' })
  @IsEnum(PortaEnum)
  porta: PortaEnum;
}

class VisualDto {
  @ApiPropertyOptional({ description: 'Tipo da linha', enum: TipoLinhaEnum, example: 'solida' })
  @IsOptional()
  @IsEnum(TipoLinhaEnum)
  tipoLinha?: TipoLinhaEnum;

  @ApiPropertyOptional({ description: 'Cor da linha em hexadecimal', example: '#22c55e' })
  @IsOptional()
  @IsString()
  cor?: string;

  @ApiPropertyOptional({ description: 'Espessura da linha (1-10)', example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  espessura?: number;
}

class PontoIntermediarioDto {
  @ApiProperty({ description: 'Coordenada X', example: 164 })
  @IsNumber()
  x: number;

  @ApiProperty({ description: 'Coordenada Y', example: 200 })
  @IsNumber()
  y: number;
}

export class CreateConexaoDto {
  @ApiProperty({ description: 'Equipamento e porta de origem', type: PortaDto })
  @ValidateNested()
  @Type(() => PortaDto)
  origem: PortaDto;

  @ApiProperty({ description: 'Equipamento e porta de destino', type: PortaDto })
  @ValidateNested()
  @Type(() => PortaDto)
  destino: PortaDto;

  @ApiPropertyOptional({ description: 'Configurações visuais da linha', type: VisualDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VisualDto)
  visual?: VisualDto;

  @ApiPropertyOptional({ description: 'Pontos intermediários da linha', type: [PontoIntermediarioDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PontoIntermediarioDto)
  pontosIntermediarios?: PontoIntermediarioDto[];

  @ApiPropertyOptional({ description: 'Rótulo da conexão', example: '380V' })
  @IsOptional()
  @IsString()
  rotulo?: string;

  @ApiPropertyOptional({ description: 'Ordem de renderização', example: 1 })
  @IsOptional()
  @IsNumber()
  ordem?: number;
}

export class UpdateConexaoDto {
  @ApiPropertyOptional({ description: 'Configurações visuais da linha', type: VisualDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VisualDto)
  visual?: VisualDto;

  @ApiPropertyOptional({ description: 'Pontos intermediários da linha', type: [PontoIntermediarioDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PontoIntermediarioDto)
  pontosIntermediarios?: PontoIntermediarioDto[];

  @ApiPropertyOptional({ description: 'Rótulo da conexão', example: '380V AC' })
  @IsOptional()
  @IsString()
  rotulo?: string;

  @ApiPropertyOptional({ description: 'Ordem de renderização', example: 2 })
  @IsOptional()
  @IsNumber()
  ordem?: number;
}

export class CreateConexoesBulkDto {
  @ApiProperty({ description: 'Lista de conexões a criar', type: [CreateConexaoDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateConexaoDto)
  conexoes: CreateConexaoDto[];
}
