import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BooleanoDoTexto } from '@/common/decorators/booleano';
import { CasasDecimais, VazioEhNulo } from '@/common/decorators/numero';
import { TIPOS_DE_DESCONTO, type TipoDeDesconto } from '../desconto-da-proposta';

/**
 * O corpo das escritas da proposta (SN-94). Até aqui as rotas recebiam um tipo
 * solto: sem o `whitelist`, qualquer campo passava, e um texto acima da coluna
 * ou um número fora do Decimal virava 500 no banco. Os tetos são os das colunas
 * (`solicitacoes_itens`, `solicitacoes_outros_custos`, os `bdi_*` da solicitação).
 */

const TEXTO_COM_CONTEUDO = /\S/;
const TETO_DO_PRECO = 999_999_999_999.99; // Decimal(14, 2)
const TETO_DA_QUANTIDADE = 9_999_999.999; // Decimal(10, 3)

export class ItemDaPropostaDto {
  @ApiProperty({ description: 'O nome da instrução (ou do item avulso)', maxLength: 200 })
  @IsString()
  @Matches(TEXTO_COM_CONTEUDO, { message: 'Diga o que é cada item da proposta.' })
  @MaxLength(200)
  descricao: string;

  @ApiPropertyOptional({ description: 'Unidade', maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidade?: string | null;

  @ApiProperty({ description: 'Quantidade (a tela manda 1: o valor fechado vai no preço)' })
  @VazioEhNulo()
  @IsNumber()
  @CasasDecimais(3)
  @Min(0)
  @Max(TETO_DA_QUANTIDADE)
  quantidade: number;

  @ApiProperty({ description: 'O valor fechado da linha' })
  @VazioEhNulo()
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(TETO_DO_PRECO)
  preco_unitario: number;

  @ApiPropertyOptional({ description: 'A sugestão do catálogo, régua da variação', nullable: true })
  @IsOptional()
  @VazioEhNulo()
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(TETO_DO_PRECO)
  preco_unitario_original?: number | null;

  @ApiPropertyOptional({ description: 'A instrução de que a linha veio', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  instrucao_id?: string | null;

  @ApiPropertyOptional({ description: 'O recurso da linha no formato antigo (uma por recurso)', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  recurso_id?: string | null;
}

export class SalvarItensDaPropostaDto {
  @ApiProperty({ description: 'A lista inteira de itens (o estado final)', type: [ItemDaPropostaDto] })
  @IsArray()
  @ArrayMaxSize(500)
  // Cada um, objeto: uma lista dentro da lista passava pelo ValidateNested e dava 500 no service
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ItemDaPropostaDto)
  itens: ItemDaPropostaDto[];
}

export class OutroCustoDaPropostaDto {
  @ApiProperty({ description: 'O que é o custo', maxLength: 200 })
  @IsString()
  @Matches(TEXTO_COM_CONTEUDO, { message: 'Diga o que é cada outro custo da proposta.' })
  @MaxLength(200)
  descricao: string;

  @ApiProperty({ description: 'Valor' })
  @VazioEhNulo()
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(TETO_DO_PRECO)
  valor: number;

  @ApiPropertyOptional({ description: 'O cliente paga o fornecedor direto (fora da base do imposto)' })
  @IsOptional()
  // Como chegou: a conversão implícita do pipe fazia "false" (e "sim") virar true
  @BooleanoDoTexto()
  @IsBoolean()
  faturamento_direto?: boolean;
}

export class SalvarOutrosCustosDaPropostaDto {
  @ApiProperty({ description: 'A lista inteira de outros custos (o estado final)', type: [OutroCustoDaPropostaDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => OutroCustoDaPropostaDto)
  custos: OutroCustoDaPropostaDto[];
}

/** Um componente do BDI, em porcentagem (Decimal(6, 3)); vazio não muda o gravado */
const Percentual = () =>
  applyDecorators(
    ApiPropertyOptional({ description: 'Percentual (0 a 100)', nullable: true }),
    IsOptional(),
    IsNumber(),
    CasasDecimais(3),
    Min(0),
    Max(100),
    VazioEhNulo(),
  );

/**
 * As condições da proposta: os componentes do BDI da solicitação (ajustados no
 * fechamento; a nova nasce com o padrão da empresa) e o desconto (28/out/2026).
 */
export class CondicoesDaPropostaDto {
  @ApiPropertyOptional({ description: 'O regime: o REIDI desonera PIS e COFINS', enum: ['SEM_REIDI', 'COM_REIDI'] })
  @IsOptional()
  @IsIn(['SEM_REIDI', 'COM_REIDI'])
  bdi_regime?: 'SEM_REIDI' | 'COM_REIDI';

  @Percentual() bdi_administracao_central?: number | null;
  @Percentual() bdi_seguro_garantia?: number | null;
  @Percentual() bdi_taxa_risco?: number | null;
  @Percentual() bdi_despesas_financeiras?: number | null;
  @Percentual() bdi_lucro?: number | null;
  @Percentual() bdi_pis?: number | null;
  @Percentual() bdi_cofins?: number | null;
  @Percentual() bdi_cprb?: number | null;
  @Percentual() bdi_issqn?: number | null;

  /** Ausente não muda o gravado; null tira o desconto */
  @ApiPropertyOptional({ description: 'O desconto, sobre o total inteiro: PERCENTUAL ou VALOR (null tira)', enum: TIPOS_DE_DESCONTO, nullable: true })
  @IsOptional()
  @IsIn([...TIPOS_DE_DESCONTO])
  desconto_tipo?: TipoDeDesconto | null;

  @ApiPropertyOptional({ description: 'O percentual (até 100) ou os reais do desconto', nullable: true })
  @IsOptional()
  @VazioEhNulo()
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(TETO_DO_PRECO)
  desconto_valor?: number | null;
}

/** Um componente do BDI padrão: obrigatório, em porcentagem (Decimal(6, 3)) */
const PercentualObrigatorio = () =>
  applyDecorators(
    ApiProperty({ description: 'Percentual (0 a 100)' }),
    VazioEhNulo(),
    IsNumber(),
    CasasDecimais(3),
    Min(0),
    Max(100),
  );

/**
 * O BDI padrão da empresa (28/out/2026): os nove componentes, todos. A
 * solicitação nova copia daqui; a que existe fica com o seu.
 */
export class BdiPadraoDto {
  @PercentualObrigatorio() bdi_administracao_central: number;
  @PercentualObrigatorio() bdi_seguro_garantia: number;
  @PercentualObrigatorio() bdi_taxa_risco: number;
  @PercentualObrigatorio() bdi_despesas_financeiras: number;
  @PercentualObrigatorio() bdi_lucro: number;
  @PercentualObrigatorio() bdi_pis: number;
  @PercentualObrigatorio() bdi_cofins: number;
  @PercentualObrigatorio() bdi_cprb: number;
  @PercentualObrigatorio() bdi_issqn: number;
}
