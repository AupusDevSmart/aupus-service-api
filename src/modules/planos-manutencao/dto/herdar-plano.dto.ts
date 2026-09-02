import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AjusteDeDataDto {
  @ApiProperty({ description: 'ID da tarefa do equipamento ANTERIOR — a que a tela mostrou' })
  @IsString()
  @IsNotEmpty()
  tarefa_id: string;

  @ApiPropertyOptional({ description: 'Quando foi feita de fato neste equipamento. Nulo zera a contagem.' })
  @IsDateString()
  @IsOptional()
  data_ultima_execucao?: string | null;
}

export class HerdarPlanoDto {
  @ApiProperty({ description: 'Posicao cujo ocupante anterior tinha o plano' })
  @IsString()
  @IsNotEmpty()
  ativo_funcional_id: string;

  @ApiProperty({ description: 'Equipamento que esta entrando na posicao (precisa ser UC)' })
  @IsString()
  @IsNotEmpty()
  equipamento_id: string;

  @ApiPropertyOptional({
    description:
      'Datas revisadas, por tarefa do equipamento anterior. Tarefa omitida entra sem data — ' +
      'e o padrao seguro, porque data errada gera vencimento errado em silencio.',
    type: [AjusteDeDataDto],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AjusteDeDataDto)
  ajustes?: AjusteDeDataDto[];

  @IsString()
  @IsOptional()
  criado_por?: string;
}

export class HerdarPlanoResponseDto {
  @ApiProperty({ description: 'ID da copia criada para o equipamento novo' })
  plano_id: string;

  @ApiProperty({ description: 'Quantas tarefas vieram do template' })
  tarefas_copiadas: number;

  @ApiProperty({ description: 'Quantas receberam data herdada' })
  datas_aplicadas: number;
}
