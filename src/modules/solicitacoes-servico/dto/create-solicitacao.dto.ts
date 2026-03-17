import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsNumber,
  IsNotEmpty,
  MaxLength,
  IsDecimal,
} from 'class-validator';
import {
  TipoSolicitacaoServico,
  PrioridadeSolicitacao,
  OrigemSolicitacao,
  StatusSolicitacaoServico,
} from '@prisma/client';



export class CreateSolicitacaoDto {
  @ApiProperty({ description: 'Título da solicitação', maxLength: 255 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  titulo: string;

  @ApiProperty({ description: 'Descrição detalhada da solicitação' })
  @IsNotEmpty()
  @IsString()
  descricao: string;

  @ApiProperty({
    description: 'Tipo de serviço solicitado',
    enum: TipoSolicitacaoServico,
  })
  @IsNotEmpty()
  @IsEnum(TipoSolicitacaoServico)
  tipo: TipoSolicitacaoServico;

  @ApiPropertyOptional({
    description: 'Status inicial da solicitação',
    enum: StatusSolicitacaoServico,
    default: StatusSolicitacaoServico.RASCUNHO,
  })
  @IsOptional()
  @IsEnum(StatusSolicitacaoServico)
  status?: StatusSolicitacaoServico;

  @ApiPropertyOptional({
    description: 'Prioridade da solicitação',
    enum: PrioridadeSolicitacao,
    default: PrioridadeSolicitacao.MEDIA,
  })
  @IsOptional()
  @IsEnum(PrioridadeSolicitacao)
  prioridade?: PrioridadeSolicitacao;

  @ApiPropertyOptional({
    description: 'Origem da solicitação',
    enum: OrigemSolicitacao,
    default: OrigemSolicitacao.PORTAL,
  })
  @IsOptional()
  @IsEnum(OrigemSolicitacao)
  origem?: OrigemSolicitacao;

  // Localização
  @ApiPropertyOptional({ description: 'ID da planta' })
  @IsOptional()
  @IsString()
  planta_id?: string;

  @ApiPropertyOptional({ description: 'ID do equipamento' })
  @IsOptional()
  @IsString()
  equipamento_id?: string;

  @ApiProperty({ description: 'Local onde o serviço será realizado', maxLength: 255 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  local: string;

  @ApiPropertyOptional({ description: 'Área específica', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  area?: string;

  // Datas e prazos
  @ApiPropertyOptional({ description: 'Data em que o serviço é necessário' })
  @IsOptional()
  @IsDateString()
  data_necessidade?: string;

  @ApiPropertyOptional({ description: 'Prazo de execução em dias' })
  @IsOptional()
  @IsNumber()
  prazo_execucao?: number;

  @ApiPropertyOptional({ description: 'Data prevista de início' })
  @IsOptional()
  @IsDateString()
  data_prevista_inicio?: string;

  @ApiPropertyOptional({ description: 'Data prevista de fim' })
  @IsOptional()
  @IsDateString()
  data_prevista_fim?: string;

  // Justificativa e benefícios
  @ApiProperty({ description: 'Justificativa para a solicitação' })
  @IsNotEmpty()
  @IsString()
  justificativa: string;

  @ApiPropertyOptional({ description: 'Benefícios esperados com o serviço' })
  @IsOptional()
  @IsString()
  beneficios_esperados?: string;

  @ApiPropertyOptional({ description: 'Riscos de não executar o serviço' })
  @IsOptional()
  @IsString()
  riscos_nao_execucao?: string;

  // Recursos estimados
  @ApiPropertyOptional({ description: 'Tempo estimado em horas' })
  @IsOptional()
  @IsNumber()
  tempo_estimado?: number;

  @ApiPropertyOptional({ description: 'Custo estimado' })
  @IsOptional()
  @IsNumber()
  custo_estimado?: number;

  @ApiPropertyOptional({ description: 'Materiais necessários' })
  @IsOptional()
  @IsString()
  materiais_necessarios?: string;

  @ApiPropertyOptional({ description: 'Ferramentas necessárias' })
  @IsOptional()
  @IsString()
  ferramentas_necessarias?: string;

  @ApiPropertyOptional({ description: 'Mão de obra necessária' })
  @IsOptional()
  @IsString()
  mao_obra_necessaria?: string;

  // Responsáveis
  @ApiProperty({ description: 'Nome do solicitante', maxLength: 255 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  solicitante_nome: string;

  @ApiPropertyOptional({ description: 'ID do solicitante' })
  @IsOptional()
  @IsString()
  solicitante_id?: string;

  @ApiPropertyOptional({ description: 'Departamento do solicitante', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  departamento?: string;

  @ApiPropertyOptional({ description: 'Contato do solicitante', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contato?: string;
}