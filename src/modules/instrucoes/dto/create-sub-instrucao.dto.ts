// src/modules/instrucoes/dto/create-sub-instrucao.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsInt,
  IsIn,
  IsNumber,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LIMITE_DA_LEITURA, TIPOS_DE_PASSO, type TipoDePasso } from '@/common/helpers/leitura';
import { CasasDecimais, VazioEhNulo } from '@/common/decorators/numero';

type Passo = { tipo?: TipoDePasso; valor_maximo?: number | null };

/** Unidade e faixa só fazem sentido no passo de leitura (SN-58). */
function SoNaLeitura(opcoes?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'soNaLeitura',
      validator: {
        validate: (_valor, args) => (args?.object as Passo).tipo === 'LEITURA',
        defaultMessage: () => 'Unidade e faixa são só do passo de leitura (tipo LEITURA).',
      },
    },
    opcoes,
  );
}

/** Mínimo acima do máximo não aceitaria leitura nenhuma. */
function AteOMaximo(opcoes?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'ateOMaximo',
      validator: {
        validate: (valor, args) => {
          const maximo = (args?.object as Passo).valor_maximo;
          return maximo === null || maximo === undefined || typeof valor !== 'number' || valor <= maximo;
        },
        defaultMessage: () => 'O mínimo da faixa passa do máximo.',
      },
    },
    opcoes,
  );
}

export class CreateSubInstrucaoDto {
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsBoolean()
  @IsOptional()
  obrigatoria?: boolean = false;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  tempo_estimado?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  ordem?: number;

  /** VERIFICACAO (marcar) ou LEITURA (digitar o valor). Vazio = VERIFICACAO, no service */
  @IsOptional()
  @IsIn(TIPOS_DE_PASSO, { message: 'O tipo do passo é VERIFICACAO ou LEITURA.' })
  tipo?: TipoDePasso;

  /** O item da OS só é marcado com uma foto dele (SN-59). Vazio = não, no service */
  @IsOptional()
  @IsBoolean()
  exige_foto?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @SoNaLeitura()
  unidade?: string | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @CasasDecimais(4)
  @Min(-LIMITE_DA_LEITURA)
  @Max(LIMITE_DA_LEITURA)
  @SoNaLeitura()
  @AteOMaximo()
  @Type(() => Number)
  @VazioEhNulo()
  valor_minimo?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @CasasDecimais(4)
  @Min(-LIMITE_DA_LEITURA)
  @Max(LIMITE_DA_LEITURA)
  @SoNaLeitura()
  @Type(() => Number)
  @VazioEhNulo()
  valor_maximo?: number | null;
}
