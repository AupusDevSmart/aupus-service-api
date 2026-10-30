import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BooleanoDoTexto } from '@/common/decorators/booleano';
import { CasasDecimais, VazioEhNulo } from '@/common/decorators/numero';
import { DiaComoData } from '@/common/decorators/dia-de-calendario';
import { TIPOS_DE_DESCONTO, type TipoDeDesconto } from '../desconto-da-proposta';
import { CHAVES_AUTOMATICAS, type ChaveAutomatica } from '../planejamento-da-proposta';

/**
 * O corpo das escritas da proposta (SN-94). Até aqui as rotas recebiam um tipo
 * solto: sem o `whitelist`, qualquer campo passava, e um texto acima da coluna
 * ou um número fora do Decimal virava 500 no banco. Os tetos são os das colunas
 * (`solicitacoes_itens`, `solicitacoes_outros_custos`, `solicitacoes_logistica`, os percentuais da solicitação).
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

/** Um percentual da proposta (Decimal(6, 3)); vazio não muda o gravado */
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

/** Um número opcional da proposta, com casas e teto da coluna; null apaga o gravado */
const NumeroOpcional = (casas: number, teto: number, descricao: string) =>
  applyDecorators(
    ApiPropertyOptional({ description: descricao, nullable: true }),
    IsOptional(),
    VazioEhNulo(),
    IsNumber(),
    CasasDecimais(casas),
    Min(0),
    Max(teto),
  );

/** Um inteiro opcional (pessoas, noites); null apaga o gravado */
const InteiroOpcional = (descricao: string) =>
  applyDecorators(ApiPropertyOptional({ description: descricao, nullable: true }), IsOptional(), VazioEhNulo(), IsInt(), Min(0), Max(999));

/**
 * As condições da proposta (29/out/2026): os percentuais (imposto, margem e
 * administração, copiados dos padrões ao criar e ajustáveis só nela), o
 * planejamento que a conta usa (km, dias, pessoas, noites), a validade, as
 * condições comerciais e o desconto.
 */
export class CondicoesDaPropostaDto {
  @Percentual() imposto_percentual?: number | null;
  @Percentual() margem_percentual?: number | null;
  @Percentual() adm_servicos_percentual?: number | null;
  @Percentual() adm_fd_percentual?: number | null;

  // Tetos de distância de verdade: a ida e volta (o dobro) e o km dos veículos cabem nas colunas
  @NumeroOpcional(2, 99_999.99, 'A distância de ida, em km (a ida e volta é o dobro)') distancia_km?: number | null;
  /** Obsoleto (30/out/2026): a ida e volta é o dobro da ida, gravado pelo servidor; aceito só para a tela de antes do deploy */
  @NumeroOpcional(2, 99_999_999.99, 'Obsoleto: o servidor grava o dobro da ida') distancia_ida_volta_km?: number | null;
  @NumeroOpcional(2, 99_999.99, 'O km rodado na obra; vazio = o padrão (% da ida e volta)') deslocamento_interno_km?: number | null;

  /** Ligar a logística automática numa proposta de antes, que tinha a logística digitada */
  @ApiPropertyOptional({ description: 'As linhas de km e refeições acompanham o planejamento' })
  @IsOptional()
  @BooleanoDoTexto()
  @IsBoolean()
  logistica_automatica?: boolean;
  @NumeroOpcional(2, 9_999.99, 'Os dias previstos de execução') dias_previstos?: number | null;
  @InteiroOpcional('As pessoas mobilizadas') pessoas_previstas?: number | null;
  @InteiroOpcional('As noites fora') noites_fora?: number | null;

  @ApiPropertyOptional({ description: 'A validade da proposta (AAAA-MM-DD); vazio apaga', nullable: true })
  @IsOptional()
  @DiaComoData()
  validade_proposta?: Date | null;

  @ApiPropertyOptional({ description: 'As condições comerciais (pagamento, exclusões, garantias)', maxLength: 4000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  condicoes_comerciais?: string | null;

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

/** Um percentual padrão: obrigatório, de 0 a 100 */
const PercentualObrigatorio = () =>
  applyDecorators(ApiProperty({ description: 'Percentual (0 a 100)' }), VazioEhNulo(), IsNumber(), CasasDecimais(3), Min(0), Max(100));

/**
 * Os percentuais padrão da proposta (29/out/2026): a solicitação nova os copia;
 * a que existe fica com os seus.
 */
export class PadroesDaPropostaDto {
  @PercentualObrigatorio() imposto_percentual: number;
  @PercentualObrigatorio() margem_percentual: number;
  @PercentualObrigatorio() adm_servicos_percentual: number;
  @PercentualObrigatorio() adm_fd_percentual: number;

  // A logística automática (30/out/2026). Ausente não muda o gravado (a tela de antes do deploy só manda os percentuais)
  @NumeroOpcional(4, 9_999.9999, 'R$ por km rodado') valor_km?: number | null;
  @NumeroOpcional(2, 24, 'Horas de estrada a cada 100 km') horas_por_100_km?: number | null;
  @NumeroOpcional(3, 100, 'O deslocamento interno quando vazio: % da ida e volta') interno_percentual?: number | null;
  @NumeroOpcional(2, 999_999.99, 'Café da manhã, por pessoa') cafe_valor?: number | null;
  @NumeroOpcional(2, 999_999.99, 'Almoço, por pessoa') almoco_valor?: number | null;
  @NumeroOpcional(2, 999_999.99, 'Jantar, por pessoa') jantar_valor?: number | null;
  @NumeroOpcional(2, 999_999.99, 'Pernoite, por pessoa e noite') pernoite_valor?: number | null;
  @ApiPropertyOptional({ description: 'Pessoas por veículo (1 a 50)' })
  @IsOptional()
  @VazioEhNulo()
  @IsInt()
  @Min(1)
  @Max(50)
  pessoas_por_veiculo?: number | null;
  @NumeroOpcional(2, 24, 'Até quantas horas de ida a equipe volta no mesmo dia') bate_volta_horas?: number | null;
  @ApiPropertyOptional({ description: 'As pessoas quando a proposta não diz (0 a 999; 0 = não supor)' })
  @IsOptional()
  @VazioEhNulo()
  @IsInt()
  @Min(0)
  @Max(999)
  pessoas_padrao?: number | null;
}

/**
 * Uma linha de frete, deslocamento ou diária (29/out/2026). Cada tabela usa as
 * suas colunas (`conta-da-proposta.ts`); a que não se aplica fica vazia.
 */
export class LinhaDeLogisticaDto {
  @ApiPropertyOptional({ description: 'Desativada fica na proposta, com o custo fora da conta' })
  @IsOptional()
  @BooleanoDoTexto()
  @IsBoolean()
  ativo?: boolean;

  @ApiPropertyOptional({ description: 'O recurso de onde o valor veio (copiado)', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  recurso_id?: string | null;

  @ApiProperty({ description: 'O que é a linha', maxLength: 200 })
  @IsString()
  @Matches(TEXTO_COM_CONTEUDO, { message: 'Diga o que é cada linha de frete, deslocamento ou diária.' })
  @MaxLength(200)
  descricao: string;

  @NumeroOpcional(3, TETO_DA_QUANTIDADE, 'Diária: a quantidade; frete: as viagens; deslocamento: os veículos (vazio = 1)') quantidade?: number | null;
  @NumeroOpcional(2, TETO_DO_PRECO, 'Diária: o valor; deslocamento: a diária do veículo') valor_unitario?: number | null;
  @NumeroOpcional(2, 9_999.99, 'Deslocamento: os dias') dias?: number | null;
  @NumeroOpcional(2, 99_999_999.99, 'Frete: km por viagem; deslocamento: km totais') km?: number | null;
  @NumeroOpcional(4, 9_999_999_999.9999, 'O valor do km') valor_km?: number | null;
  @NumeroOpcional(2, TETO_DO_PRECO, 'Frete: o valor fixo') valor_fixo?: number | null;

  /** A linha que o planejamento calcula (30/out/2026): o servidor acerta as quantidades dela */
  @ApiPropertyOptional({ description: 'A chave da linha automática; nula na digitada', enum: CHAVES_AUTOMATICAS, nullable: true })
  @IsOptional()
  @IsIn([...CHAVES_AUTOMATICAS])
  automatica?: ChaveAutomatica | null;

  @ApiPropertyOptional({ description: 'A automática ajustada à mão: deixa de acompanhar o planejamento' })
  @IsOptional()
  @BooleanoDoTexto()
  @IsBoolean()
  ajustada?: boolean;
}

export class SalvarLogisticaDaPropostaDto {
  @ApiProperty({ description: 'A lista inteira da tabela (o estado final)', type: [LinhaDeLogisticaDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LinhaDeLogisticaDto)
  linhas: LinhaDeLogisticaDto[];
}

/** O motivo de a proposta não ter sido aprovada (29/out/2026): obrigatório, vai para o histórico */
export class NaoAprovadaDto {
  @ApiProperty({ description: 'Por que o cliente não aprovou', maxLength: 1000 })
  @IsString()
  @Matches(TEXTO_COM_CONTEUDO, { message: 'Diga por que a proposta não foi aprovada.' })
  @MaxLength(1000)
  motivo: string;
}

/** Reabrir a proposta revisada ou não aprovada; o motivo, se vier, vai para o histórico */
export class ReabrirPropostaDto {
  @ApiPropertyOptional({ description: 'Por que a proposta volta à edição', maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo?: string | null;
}
