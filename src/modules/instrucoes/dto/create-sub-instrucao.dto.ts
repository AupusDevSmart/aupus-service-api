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
import { LIMITE_DA_LEITURA, REGISTROS_DO_PASSO, type RegistroDoPasso } from '@/common/helpers/leitura';
import { CasasDecimais, VazioEhNulo } from '@/common/decorators/numero';
import { DISCIPLINAS, type Disciplina } from '../passos-da-instrucao';

type Passo = { registro?: RegistroDoPasso; valor_maximo?: number | null };

/** Unidade e faixa só fazem sentido no passo de leitura (SN-58). */
function SoNaLeitura(opcoes?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'soNaLeitura',
      validator: {
        validate: (_valor, args) => (args?.object as Passo).registro === 'LEITURA',
        defaultMessage: () => 'Unidade e faixa são só do passo de leitura (registro LEITURA).',
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

/**
 * O passo da instrução: os campos do AupusProject (descrição, disciplina,
 * duração em horas, obrigatório) e os que só o Service tem (o registro de
 * leitura, a faixa e a foto).
 */
export class CreateSubInstrucaoDto {
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsBoolean()
  @IsOptional()
  obrigatoria?: boolean;

  /** SN-85: a disciplina do passo, como no AupusProject. Vazio = sem disciplina */
  @IsOptional()
  @VazioEhNulo()
  @IsIn(DISCIPLINAS, { message: 'A disciplina do passo é administrativo, civil, eletrico ou mecanico.' })
  tipo?: Disciplina | null;

  /** SN-85: quanto o passo leva, em horas (era tempo_estimado, em minutos) */
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @CasasDecimais(2)
  @Min(0)
  @Max(9999)
  duracao_horas?: number | null;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  ordem?: number;

  /** VERIFICACAO (marcar) ou LEITURA (digitar o valor). Vazio = VERIFICACAO, no service. Era `tipo` */
  @IsOptional()
  @IsIn(REGISTROS_DO_PASSO, { message: 'O registro do passo é VERIFICACAO ou LEITURA.' })
  registro?: RegistroDoPasso;

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
