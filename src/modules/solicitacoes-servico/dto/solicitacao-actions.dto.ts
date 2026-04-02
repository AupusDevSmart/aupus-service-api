import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class AdicionarComentarioDto {
  @ApiProperty({ description: 'Comentário' })
  @IsNotEmpty()
  @IsString()
  comentario: string;

  @ApiProperty({ description: 'Nome do usuário' })
  @IsNotEmpty()
  @IsString()
  usuario_nome: string;

  @ApiPropertyOptional({ description: 'ID do usuário' })
  @IsOptional()
  @IsString()
  usuario_id?: string;
}

export class GerarProgramacaoOSDto {
  @ApiPropertyOptional({ description: 'Observações adicionais para a programação' })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Tempo estimado em horas' })
  @IsOptional()
  tempo_estimado?: number;

  @ApiPropertyOptional({ description: 'Duração estimada em horas' })
  @IsOptional()
  duracao_estimada?: number;
}
