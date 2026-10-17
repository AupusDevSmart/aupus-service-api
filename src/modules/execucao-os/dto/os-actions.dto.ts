import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsDateString,
  IsArray,
  IsNotEmpty,
  Length,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LIMITE_DA_LEITURA } from '@/common/helpers/leitura';
import { InstanteComFuso } from '@/common/decorators/instante';
import { CasasDecimais, VazioEhNulo } from '@/common/decorators/numero';

export class ReservaVeiculoDto {
  @ApiProperty({ description: 'ID do veículo' })
  @IsString()
  @IsNotEmpty()
  veiculo_id: string;

  @ApiProperty({ description: 'Data de início da reserva', example: '2025-02-15' })
  @IsDateString()
  data_inicio: string;

  @ApiProperty({ description: 'Data de fim da reserva', example: '2025-02-15' })
  @IsDateString()
  data_fim: string;

  @ApiProperty({ description: 'Hora de início', example: '08:00' })
  @IsString()
  @Length(5, 5)
  hora_inicio: string;

  @ApiProperty({ description: 'Hora de fim', example: '17:00' })
  @IsString()
  @Length(5, 5)
  hora_fim: string;

  @ApiProperty({ description: 'Finalidade da reserva' })
  @IsString()
  @IsNotEmpty()
  finalidade: string;

  @ApiPropertyOptional({ description: 'KM inicial' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  km_inicial?: number;
}

export class ProgramarOSDto {
  @ApiProperty({ description: 'Data e hora programada', example: '2025-02-15T08:00:00Z' })
  @IsDateString()
  data_hora_programada: string;

  @ApiProperty({ description: 'Responsável pela execução' })
  @IsString()
  @IsNotEmpty()
  responsavel: string;

  @ApiPropertyOptional({ description: 'ID do responsável' })
  @IsOptional()
  @IsString()
  responsavel_id?: string;

  @ApiPropertyOptional({ description: 'Time/equipe' })
  @IsOptional()
  @IsString()
  time_equipe?: string;

  @ApiPropertyOptional({ description: 'IDs dos materiais confirmados (lista vazia significa sem materiais confirmados)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  materiais_confirmados?: string[];

  @ApiPropertyOptional({ description: 'IDs das ferramentas confirmadas (lista vazia significa sem ferramentas confirmadas)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ferramentas_confirmadas?: string[];

  @ApiPropertyOptional({ description: 'IDs dos técnicos confirmados (lista vazia significa sem técnicos confirmados)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tecnicos_confirmados?: string[];

  @ApiPropertyOptional({ description: 'Reserva de veículo' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReservaVeiculoDto)
  reserva_veiculo?: ReservaVeiculoDto;

  @ApiPropertyOptional({ description: 'Observações da programação' })
  @IsOptional()
  @IsString()
  observacoes_programacao?: string;
}

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
  @IsDateString()
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

  @ApiPropertyOptional({ description: 'Data e hora de fim real', example: '2025-02-15T17:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_hora_fim_real?: string;

  @ApiProperty({ description: 'Resultado do serviço executado' })
  @IsString()
  @IsNotEmpty()
  resultado_servico: string;

  // SN-60: os dados de falha. Na corretiva, dizer se parou; sintoma, causa e
  // ação obrigatórios; a parada, se parou (regra em dados-de-falha.ts)
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

  @ApiPropertyOptional({ description: 'Data sugerida para próxima manutenção', example: '2025-08-15' })
  @IsOptional()
  @IsDateString()
  proxima_manutencao?: string;

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

  @ApiPropertyOptional({ description: 'Custos adicionais não planejados' })
  @IsOptional()
  @IsNumber()
  @CasasDecimais(2)
  @Min(0)
  custos_adicionais?: number;
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