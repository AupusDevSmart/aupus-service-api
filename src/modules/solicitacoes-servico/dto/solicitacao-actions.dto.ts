import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsDateString } from 'class-validator';

export class AnalisarSolicitacaoDto {
  @ApiPropertyOptional({ description: 'Observações da análise' })
  @IsOptional()
  @IsString()
  observacoes_analise?: string;

  @ApiPropertyOptional({ description: 'Parecer técnico' })
  @IsOptional()
  @IsString()
  parecer_tecnico?: string;
}

export class AprovarSolicitacaoDto {
  @ApiPropertyOptional({ description: 'Observações da aprovação' })
  @IsOptional()
  @IsString()
  observacoes_aprovacao?: string;

  @ApiPropertyOptional({ description: 'Data prevista de início' })
  @IsOptional()
  @IsDateString()
  data_prevista_inicio?: string;

  @ApiPropertyOptional({ description: 'Data prevista de fim' })
  @IsOptional()
  @IsDateString()
  data_prevista_fim?: string;
}

export class RejeitarSolicitacaoDto {
  @ApiProperty({ description: 'Motivo da rejeição' })
  @IsNotEmpty()
  @IsString()
  motivo_rejeicao: string;

  @ApiPropertyOptional({ description: 'Sugestões alternativas' })
  @IsOptional()
  @IsString()
  sugestoes_alternativas?: string;
}

export class CancelarSolicitacaoDto {
  @ApiProperty({ description: 'Motivo do cancelamento' })
  @IsNotEmpty()
  @IsString()
  motivo_cancelamento: string;
}

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