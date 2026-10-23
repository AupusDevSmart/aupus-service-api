import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RegistroImportadoDto {
  @ApiPropertyOptional({ description: 'Vazio = registro novo.' })
  @IsOptional()
  @IsString()
  id: string | null;

  @ApiProperty({ example: 'RESUMO' })
  @IsString()
  aba: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  linha: number;

  @ApiPropertyOptional({ description: 'O updated_at do registro quando foi exportado (ISO).' })
  @IsOptional()
  @IsString()
  atualizado_em: string | null;

  /**
   * O payload do formulário. Não é validado aqui: cada registro passa pelo
   * DTO do próprio cadastro, com o mesmo `forbidNonWhitelisted` da tela.
   */
  @ApiProperty({ type: Object })
  @IsObject()
  dados: Record<string, unknown>;
}

/** Onde o item aparece primeiro na planilha, para apontar o erro */
class OndeNaPlanilhaDto {
  @IsString()
  @MaxLength(60)
  aba: string;

  @IsInt()
  @Min(1)
  linha: number;
}

/**
 * Um recurso que a planilha de instruções cita (SN-98). Os limites daqui só
 * barram o absurdo: o valor fora da regra (preço com três casas, unidade
 * longa) é do `CreateRecursoDto`/`UpdateRecursoDto` do item, que vira erro com
 * aba e linha — um 400 aqui recusaria a planilha inteira sem dizer onde.
 */
export class RecursoDaPlanilhaDto extends OndeNaPlanilhaDto {
  @IsString()
  @MaxLength(255)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  id: string | null;

  @IsIn(['recursos', 'materiais'])
  grupo: 'recursos' | 'materiais';

  @IsOptional()
  @IsString()
  @MaxLength(30)
  categoria: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  base_calculo: string | null;

  @IsOptional()
  @IsNumber()
  preco: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  unidade: string | null;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  problemas: string[];
}

/** Como no recurso: o limite da tarefa é o do `CreateTarefaDto`, que só roda se o plano for criado */
export class TarefaDoPlanoDaPlanilhaDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nome: string | null;

  @IsString()
  @MaxLength(1000)
  instrucao: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  frequencia: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  frequencia_personalizada: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  criticidade: number | null;
}

/** Uma linha de tarefa que o front não conseguiu ler: só vira erro se o plano for criado */
export class ProblemaDaTarefaDto {
  @IsInt()
  @Min(1)
  linha: number;

  @IsString()
  @MaxLength(500)
  mensagem: string;
}

/** Um plano que uma aba da planilha de equipamentos cita, com as tarefas da seção TAREFAS DO PLANO dela (SN-98) */
export class PlanoDaPlanilhaDto extends OndeNaPlanilhaDto {
  @IsString()
  @MaxLength(255)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  categoria: string | null;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => TarefaDoPlanoDaPlanilhaDto)
  tarefas: TarefaDoPlanoDaPlanilhaDto[];

  @IsInt()
  @Min(1)
  linha_das_tarefas: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  plano_ref: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  equipamento_id: string | null;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ProblemaDaTarefaDto)
  problemas: ProblemaDaTarefaDto[];
}

export class CatalogosDaPlanilhaDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => RecursoDaPlanilhaDto)
  recursos?: RecursoDaPlanilhaDto[];

  /** Uma entrada por aba de equipamento: até o limite de registros */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => PlanoDaPlanilhaDto)
  planos?: PlanoDaPlanilhaDto[];
}

export class ImportarPlanilhaDto {
  @ApiProperty({ description: 'false = só a prévia; true = grava (tudo ou nada).' })
  @IsBoolean()
  confirmar: boolean;

  @ApiProperty({ type: [RegistroImportadoDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => RegistroImportadoDto)
  registros: RegistroImportadoDto[];

  @ApiPropertyOptional({ description: 'O que a planilha cita de outros cadastros e a importação cria ou atualiza (SN-98).' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CatalogosDaPlanilhaDto)
  catalogos?: CatalogosDaPlanilhaDto;
}
