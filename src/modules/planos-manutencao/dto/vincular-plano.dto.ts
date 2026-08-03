// src/modules/planos-manutencao/dto/vincular-plano.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VincularPlanoDto {
  @ApiProperty({ description: 'ID do equipamento (precisa ser UC)' })
  @IsString()
  @IsNotEmpty()
  equipamento_id: string;

  @ApiProperty({ description: 'ID do plano template, da mesma categoria do modelo do equipamento' })
  @IsString()
  @IsNotEmpty()
  plano_id: string;

  @IsString()
  @IsOptional()
  criado_por?: string;
}

export class VincularPlanoResponseDto {
  @ApiProperty({ description: 'ID da copia criada para o equipamento' })
  plano_id: string;

  @ApiProperty({ description: 'Quantas tarefas foram copiadas do template' })
  tarefas_copiadas: number;

  @ApiProperty({ description: 'Se substituiu um vinculo anterior' })
  substituiu_vinculo_anterior: boolean;

  @ApiProperty({ description: 'Tarefas proprias do equipamento descartadas na substituicao' })
  tarefas_proprias_descartadas: number;

  @ApiProperty({ description: 'Tarefas customizadas localmente descartadas na substituicao' })
  tarefas_customizadas_descartadas: number;
}

export class PreviaDesvinculoDto {
  @ApiProperty({ description: 'Se existe copia vinculada ao equipamento' })
  possui_plano: boolean;

  @ApiProperty({ description: 'Total de tarefas da copia' })
  total_tarefas: number;

  @ApiProperty({ description: 'Tarefas criadas direto no equipamento, que serao perdidas' })
  tarefas_proprias: number;

  @ApiProperty({ description: 'Tarefas herdadas e editadas localmente, que serao perdidas' })
  tarefas_customizadas: number;
}
