import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ListarNotificacoesDto {
  // Com enableImplicitConversion, o `value` já chega convertido e "false" vira
  // true (Boolean('false')): lê o original em `obj`. Só "true" é true
  @ApiPropertyOptional({ description: 'Só as não lidas' })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key] === true || obj[key] === 'true')
  @IsBoolean()
  somenteNaoLidas?: boolean;

  // Sem teto, ?page=1e20 é inteiro válido e o skip estoura no Prisma (500)
  @ApiPropertyOptional({ default: 1, maximum: 10_000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class PreferenciaDto {
  @ApiProperty({ example: 'programacao.criada' })
  @IsString()
  @MaxLength(60)
  evento: string;

  @ApiProperty({ description: 'Receber por e-mail' })
  @IsBoolean()
  email: boolean;
}

export class SalvarPreferenciasDto {
  @ApiProperty({ type: [PreferenciaDto] })
  @IsArray()
  // O catálogo tem uns 20 eventos: sem teto, um PUT faria milhares de upserts numa transação
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PreferenciaDto)
  preferencias: PreferenciaDto[];
}
