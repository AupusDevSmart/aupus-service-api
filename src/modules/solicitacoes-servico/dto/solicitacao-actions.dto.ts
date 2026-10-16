import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

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
