import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsArray,
  IsNotEmpty,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LIMITE_DA_LEITURA } from '@/common/helpers/leitura';
import { InstanteComFuso } from '@/common/decorators/instante';
import { CasasDecimais, VazioEhNulo } from '@/common/decorators/numero';
import { NATUREZAS_DOS_OUTROS_CUSTOS, type NaturezaDoOutroCusto } from '../natureza-do-custo';

export class IniciarExecucaoDto {
  @ApiPropertyOptional({ description: 'Equipe presente na execução' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipe_presente?: string[];

  @ApiPropertyOptional({ description: 'Responsável pela execução' })
  @IsOptional()
  @IsString()
  responsavel_execucao?: string;

  @ApiPropertyOptional({ description: 'Observações do início' })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Data e hora de início real', example: '2025-02-15T08:00:00Z' })
  @IsOptional()
  @InstanteComFuso()
  data_hora_inicio_real?: string;

  @ApiPropertyOptional({ description: 'Km da viatura na saída (opcional; só com reserva)', example: 12500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  km_inicial?: number;
}

export class PausarExecucaoDto {
  @ApiProperty({ description: 'Motivo da pausa' })
  @IsString()
  @IsNotEmpty()
  motivo_pausa: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class RetomarExecucaoDto {
  @ApiPropertyOptional({ description: 'Observações da retomada' })
  @IsOptional()
  @IsString()
  observacoes_retomada?: string;
}

export class AtividadeChecklistDto {
  @ApiProperty({ description: 'ID da atividade' })
  @IsString()
  @IsNotEmpty()
  id: string;

  /** Obrigatório na verificação; na leitura segue o valor (SN-58) */
  @ApiPropertyOptional({ description: 'Atividade concluída. Na leitura, opcional: concluída = tem valor' })
  @IsOptional()
  @IsBoolean()
  concluida?: boolean;

  /** A explicação da leitura fora da faixa vai para o relatório: tamanho de texto, não de arquivo */
  @ApiPropertyOptional({ description: 'Observações (até 2000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string | null;

  @ApiPropertyOptional({ description: 'Valor medido, só no item de leitura. null apaga a leitura', nullable: true })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @CasasDecimais(4)
  @Min(-LIMITE_DA_LEITURA)
  @Max(LIMITE_DA_LEITURA)
  @VazioEhNulo()
  valor_lido?: number | null;
}

export class AtualizarChecklistDto {
  @ApiProperty({ description: 'Lista de atividades (até 500)', type: [AtividadeChecklistDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AtividadeChecklistDto)
  atividades: AtividadeChecklistDto[];
}

export class MaterialConsumoDto {
  @ApiProperty({ description: 'ID do material' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Quantidade consumida' })
  @IsNumber()
  @CasasDecimais(3)
  @Min(0)
  quantidade_consumida: number;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class RegistrarMateriaisDto {
  @ApiProperty({ description: 'Lista de materiais consumidos', type: [MaterialConsumoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialConsumoDto)
  materiais: MaterialConsumoDto[];
}

export class FerramentaUsoDto {
  @ApiProperty({ description: 'ID da ferramenta' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Ferramenta utilizada' })
  @IsBoolean()
  utilizada: boolean;

  @ApiPropertyOptional({ description: 'Condição antes do uso' })
  @IsOptional()
  @IsString()
  condicao_antes?: string;

  @ApiPropertyOptional({ description: 'Condição depois do uso' })
  @IsOptional()
  @IsString()
  condicao_depois?: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class RegistrarFerramentasDto {
  @ApiProperty({ description: 'Lista de ferramentas utilizadas', type: [FerramentaUsoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FerramentaUsoDto)
  ferramentas: FerramentaUsoDto[];
}

export class ConcluirTarefaDto {
  @ApiPropertyOptional({ description: 'Observações da conclusão' })
  @IsOptional()
  @IsString()
  observacoes?: string;

  @ApiPropertyOptional({ description: 'Tempo de execução em minutos' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  tempo_execucao?: number;

  @ApiPropertyOptional({ description: 'Problemas encontrados' })
  @IsOptional()
  @IsString()
  problemas_encontrados?: string;

  @ApiPropertyOptional({ description: 'Quem concluiu a tarefa' })
  @IsOptional()
  @IsString()
  concluida_por?: string;
}

export class CancelarTarefaDto {
  @ApiProperty({ description: 'Motivo do cancelamento' })
  @IsString()
  @IsNotEmpty()
  motivo_cancelamento: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class MaterialFinalizacaoDto {
  @ApiProperty({ description: 'ID do material' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Quantidade consumida final (mínimo 0.001)' })
  @IsNumber()
  @CasasDecimais(3)
  @Min(0.001)
  quantidade_consumida: number;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class FerramentaFinalizacaoDto {
  @ApiProperty({ description: 'ID da ferramenta' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Condição final da ferramenta' })
  @IsString()
  @IsNotEmpty()
  condicao_depois: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

/** Tarefa que a equipe não conseguiu fazer, com o motivo (SPEC-EXECUCAO-DA-OS, D2) */
export class TarefaNaoFeitaDto {
  @ApiProperty({ description: 'ID do vínculo da tarefa na OS (tarefas_os.id)' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Por que não foi feita' })
  @IsString()
  @IsNotEmpty()
  motivo: string;
}

export class HorasDoTecnicoDto {
  @ApiProperty({ description: 'ID da linha do técnico na OS (tecnicos_os.id)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  id: string;

  @ApiProperty({ description: 'Horas trabalhadas, até 2 casas (0 se não trabalhou)', example: 3.5 })
  @VazioEhNulo()
  @IsNumber()
  @Min(0)
  @Max(999.99)
  @CasasDecimais(2)
  horas: number;
}

export class TecnicoExtraDto {
  @ApiProperty({ description: 'ID do usuário que entrou na execução sem estar escalado' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  tecnico_id: string;

  @ApiProperty({ description: 'Horas trabalhadas, até 2 casas', example: 2 })
  @VazioEhNulo()
  @IsNumber()
  @Min(0)
  @Max(999.99)
  @CasasDecimais(2)
  horas: number;

  /**
   * SN-93: sem ele, a pessoa entrava sem valor/hora e o custo dela era R$ 0,
   * calado. Sem ele aqui, vale o de quem tem a mesma especialidade na equipe.
   */
  @ApiPropertyOptional({ description: 'Valor da hora de quem entrou (sem ele, o de quem tem a mesma especialidade na equipe)', example: 78 })
  @VazioEhNulo()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99_999.99)
  @CasasDecimais(2)
  custo_hora?: number | null;
}

/**
 * Um outro custo da OS no Executar (SN-93, D2): o previsto (do orçamento) com o
 * valor que custou, ou o não previsto, lançado ali com descrição.
 */
export class OutroCustoDto {
  @ApiPropertyOptional({ description: 'O item que já está na OS (sem ele, é um não previsto novo)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  id?: string;

  @ApiPropertyOptional({ description: 'A descrição do não previsto (a do previsto não muda)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descricao?: string;

  @ApiPropertyOptional({ description: 'A natureza do não previsto (a do previsto não muda)', enum: NATUREZAS_DOS_OUTROS_CUSTOS })
  @IsOptional()
  @IsIn(NATUREZAS_DOS_OUTROS_CUSTOS)
  natureza?: NaturezaDoOutroCusto;

  @ApiProperty({ description: 'O que custou (0 = não houve)', example: 1402.5 })
  @VazioEhNulo()
  @IsNumber()
  @Min(0)
  // Por item, com folga no total: 200 itens no teto ainda cabem no custo_real (Decimal(12,2)); acima, o 400 virava 500
  @Max(9_999_999.99)
  @CasasDecimais(2)
  valor_real: number;
}

/** Os outros custos registrados depois de executar (no editar da OS, como o consumo de material) */
export class RegistrarOutrosCustosDto {
  @ApiProperty({ description: 'A lista inteira: o não previsto que não vem sai da OS', type: [OutroCustoDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OutroCustoDto)
  outros_custos: OutroCustoDto[];
}

export class ExecutarOSDto {
  @ApiPropertyOptional({
    description: 'Tarefas pendentes que não foram feitas, cada uma com o motivo. Toda tarefa ainda pendente precisa estar aqui.',
    type: [TarefaNaoFeitaDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TarefaNaoFeitaDto)
  tarefas_nao_feitas?: TarefaNaoFeitaDto[];

  // SN-61: as horas reais. Toda linha da equipe precisa estar aqui (0 = não foi)
  @ApiPropertyOptional({
    description: 'Horas trabalhadas de cada técnico da OS. Obrigatório para toda linha da equipe (0 se não trabalhou).',
    type: [HorasDoTecnicoDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HorasDoTecnicoDto)
  horas_dos_tecnicos?: HorasDoTecnicoDto[];

  @ApiPropertyOptional({
    description: 'Quem trabalhou sem estar escalado: usuário que pode atuar na planta e as horas',
    type: [TecnicoExtraDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TecnicoExtraDto)
  tecnicos_extras?: TecnicoExtraDto[];

  @ApiPropertyOptional({ description: 'Data e hora de fim real', example: '2025-02-15T17:00:00Z' })
  @IsOptional()
  @InstanteComFuso()
  data_hora_fim_real?: string;

  @ApiProperty({ description: 'Resultado do serviço executado' })
  @IsString()
  @IsNotEmpty()
  resultado_servico: string;

  // SN-60: os dados de falha. Na corretiva, dizer se parou; sintoma, causa e
  // ação obrigatórios; quando parou e voltou, opcionais e os dois juntos
  // (regra em dados-de-falha.ts)
  @ApiPropertyOptional({ description: 'O equipamento parou? Obrigatório na corretiva' })
  @IsOptional()
  @IsBoolean()
  equipamento_parou?: boolean;

  @ApiPropertyOptional({ description: 'Quando o equipamento parou (ISO com fuso)' })
  @IsOptional()
  @InstanteComFuso()
  parada_inicio?: string;

  @ApiPropertyOptional({ description: 'Quando o equipamento voltou a funcionar (ISO com fuso)' })
  @IsOptional()
  @InstanteComFuso()
  parada_fim?: string;

  @ApiPropertyOptional({ description: 'O sintoma: o que se viu (até 2000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  falha_sintoma?: string;

  @ApiPropertyOptional({ description: 'A causa da falha (até 2000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  falha_causa?: string;

  @ApiPropertyOptional({ description: 'A ação tomada (até 2000 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  falha_acao?: string;

  @ApiPropertyOptional({ description: 'Problemas encontrados durante a execução' })
  @IsOptional()
  @IsString()
  problemas_encontrados?: string | null;

  @ApiPropertyOptional({ description: 'Recomendações para futuras manutenções' })
  @IsOptional()
  @IsString()
  recomendacoes?: string | null;

  @ApiPropertyOptional({ description: 'Materiais consumidos', type: [MaterialFinalizacaoDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialFinalizacaoDto)
  materiais_consumidos?: MaterialFinalizacaoDto[];

  @ApiPropertyOptional({ description: 'Ferramentas utilizadas', type: [FerramentaFinalizacaoDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FerramentaFinalizacaoDto)
  ferramentas_utilizadas?: FerramentaFinalizacaoDto[];

  @ApiPropertyOptional({ description: 'KM final do veículo' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  km_final?: number;

  @ApiPropertyOptional({ description: 'Observações sobre o veículo' })
  @IsOptional()
  @IsString()
  observacoes_veiculo?: string;

  @ApiPropertyOptional({ description: 'Atividades realizadas durante a execução' })
  @IsOptional()
  @IsString()
  atividades_realizadas?: string;

  @ApiPropertyOptional({ description: 'Procedimentos seguidos durante a execução' })
  @IsOptional()
  @IsString()
  procedimentos_seguidos?: string;

  @ApiPropertyOptional({ description: 'EPIs e equipamentos de segurança utilizados' })
  @IsOptional()
  @IsString()
  equipamentos_seguranca?: string;

  @ApiPropertyOptional({ description: 'Incidentes de segurança ocorridos' })
  @IsOptional()
  @IsString()
  incidentes_seguranca?: string | null;

  /** Antes do SN-93: um número só, sem descrição. A tela de agora lança o não previsto em `outros_custos` */
  @ApiPropertyOptional({ description: 'Custos adicionais não planejados (antigo: use outros_custos)' })
  @IsOptional()
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  @Max(9_999_999.99)
  custos_adicionais?: number;

  @ApiPropertyOptional({
    description: 'SN-93: os outros custos conferidos (o previsto com o valor real) e os não previstos. O não previsto que já existia e não vem sai.',
    type: [OutroCustoDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OutroCustoDto)
  outros_custos?: OutroCustoDto[];
}

export class AuditarOSDto {
  @ApiPropertyOptional({ description: 'Avaliação da qualidade (1-5)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  avaliacao_qualidade?: number;

  @ApiPropertyOptional({ description: 'Observações sobre a qualidade' })
  @IsOptional()
  @IsString()
  observacoes_qualidade?: string;
}

export class ReabrirOSDto {
  @ApiPropertyOptional({ description: 'Observações sobre a reabertura' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class FinalizarOSDto {
  @ApiPropertyOptional({ description: 'Observações sobre a finalização' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class CancelarOSDto {
  @ApiProperty({ description: 'Motivo do cancelamento' })
  @IsString()
  @IsNotEmpty()
  motivo_cancelamento: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

/** Onde o anexo prova alguma coisa (SN-59): sem os dois, é o anexo geral da OS */
export class AdicionarAnexoDto {
  @ApiPropertyOptional({ description: 'A tarefa da OS que o anexo prova (tarefas_os.id)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tarefa_os_id?: string;

  @ApiPropertyOptional({ description: 'O item do checklist que o anexo prova; a tarefa vem dele' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  checklist_item_id?: string;

  @ApiPropertyOptional({ description: 'Descrição do anexo' })
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiPropertyOptional({ description: 'Fase da execução', enum: ['antes', 'durante', 'depois'] })
  @IsOptional()
  @IsString()
  // A coluna é VarChar(50): passando, o create dava 500 com o arquivo já no disco
  @MaxLength(50)
  fase_execucao?: string;
}