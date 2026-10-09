import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
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
}
