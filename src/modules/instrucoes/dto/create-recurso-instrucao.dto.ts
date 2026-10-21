// src/modules/instrucoes/dto/create-recurso-instrucao.dto.ts
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CasasDecimais, VazioEhNulo } from '@/common/decorators/numero';
import { DECIMAL_10_2, DECIMAL_10_3, DECIMAL_12_2 } from '@/common/helpers/limites-decimais';

/**
 * Uma linha de recurso da instrução, a `instrucao_recursos` do AupusProject
 * (SN-85). O recurso é do catálogo (nome, categoria, cobrança e preço vêm de
 * lá); o resto é do USO: o mesmo cabo perde 10% numa obra e 25% na outra, o
 * mesmo transformador é nosso numa e do cliente na outra.
 *
 * Os campos que a cobrança do recurso não usa são limpos ao gravar
 * (`linhas-da-instrucao.ts`), como a tela do AupusProject faz.
 */
export class CreateRecursoInstrucaoDto {
  @IsString()
  @IsNotEmpty()
  recurso_id: string;

  /** Quantos (pessoas, equipamentos, unidades do material). Vazio = 1 */
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(3)
  @Min(0)
  @Max(DECIMAL_10_3)
  quantidade?: number | null;

  /** Horas de uso de cada um, na cobrança por hora ou por diária. Vazio = 0 */
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_10_2)
  duracao_horas?: number | null;

  /** A perda do material, em fração: 0,10 = 10%. Vazio = 0 */
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(4)
  @Min(0)
  @Max(1)
  fator_perda?: number | null;

  /** Faturamento direto: o cliente compra, entra no escopo e fica fora do custo */
  @IsOptional()
  @IsBoolean()
  fornecido_pelo_cliente?: boolean;

  /** Só na cobrança por km */
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_10_2)
  distancia_km?: number | null;

  /** O preço de uma unidade da cobrança só nesta instrução. Vazio = o do cadastro */
  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_12_2)
  preco_proprio?: number | null;
}

/** Uma linha de maquinário da instrução (a `instrucao_maquinarios` do AupusProject) */
export class CreateMaquinarioInstrucaoDto {
  @IsString()
  @IsNotEmpty()
  maquinario_id: string;

  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_10_2)
  quantidade?: number | null;

  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_10_2)
  duracao_horas?: number | null;

  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_10_2)
  distancia_km?: number | null;

  @IsOptional()
  @VazioEhNulo()
  @Type(() => Number)
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(DECIMAL_12_2)
  preco_proprio?: number | null;
}
