import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const aparar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Comentário novo (SN-48). O autor é quem está logado: não vem no corpo. */
export class NovoComentarioDto {
  @ApiProperty({ description: 'O texto do comentário' })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  comentario: string;

  // Com enableImplicitConversion, "false" viraria true: lê o original. Só true é true
  @ApiPropertyOptional({ description: 'Interno: só a equipe vê e marca.' })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => (obj[key] === undefined ? undefined : obj[key] === true))
  @IsBoolean()
  interno?: boolean;
}

export class EditarComentarioDto {
  @ApiProperty({ description: 'O texto novo' })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  comentario: string;
}
