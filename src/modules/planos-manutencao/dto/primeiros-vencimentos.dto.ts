import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { FORMATO_DO_DIA } from '../../agenda/dia-do-calendario';

export class PrimeirosVencimentosQueryDto {
  @ApiProperty({ example: '2026-05-10', description: 'O dia em que o plano começa a contar (Brasília)' })
  @IsString()
  @Matches(FORMATO_DO_DIA, { message: 'data_inicio deve ser uma data AAAA-MM-DD' })
  data_inicio: string;

  @ApiPropertyOptional({ description: 'O equipamento (UC): dá a planta e os dias úteis. Sem ele (no cadastro), só o vencimento.' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  equipamento_id?: string;
}

export class PrimeiroVencimentoDto {
  @ApiProperty({ description: 'A tarefa do template' })
  tarefa_id: string;

  @ApiProperty()
  tag: string;

  @ApiProperty()
  nome: string;

  @ApiPropertyOptional({ nullable: true })
  frequencia: string | null;

  @ApiPropertyOptional({ nullable: true })
  frequencia_personalizada: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'O primeiro vencimento; null = sem periodicidade' })
  vence_em: Date | null;

  @ApiProperty({ description: 'Já nasce vencida: sai na primeira rodada do gerador' })
  atrasada: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'O próximo dia útil da planta' })
  data_programada: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'A rodada do gerador (3h de Brasília) que cria a programação' })
  programacao_a_partir_de: Date | null;
}

export class PrimeirosVencimentosDto {
  @ApiProperty({ description: 'A âncora que as tarefas da cópia vão receber (00:00 de Brasília do dia)' })
  ancora: Date;

  @ApiPropertyOptional({ nullable: true, description: 'Se o equipamento tem planta (sem ela o gerador não programa); null sem equipamento' })
  com_planta: boolean | null;

  @ApiProperty({ type: [PrimeiroVencimentoDto] })
  tarefas: PrimeiroVencimentoDto[];
}
