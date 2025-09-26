import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoDocumentacaoVeiculo } from '@prisma/client';

export class DocumentacaoVeiculoResponseDto {
  @ApiProperty({
    description: 'ID da documentação',
    example: 'doc_01234567890123456789012345'
  })
  id: string;

  @ApiProperty({
    description: 'Tipo de documentação',
    enum: TipoDocumentacaoVeiculo,
    example: TipoDocumentacaoVeiculo.ipva
  })
  tipo: TipoDocumentacaoVeiculo;

  @ApiProperty({
    description: 'Descrição da documentação',
    example: 'CRLV 2025'
  })
  descricao: string;

  @ApiPropertyOptional({
    description: 'Data de vencimento',
    example: '2025-12-31T00:00:00.000Z'
  })
  dataVencimento?: Date;

  @ApiPropertyOptional({
    description: 'Número do documento',
    example: '123456789'
  })
  numeroDocumento?: string;

  @ApiPropertyOptional({
    description: 'Órgão emissor',
    example: 'DETRAN-SP'
  })
  orgaoEmissor?: string;

  @ApiPropertyOptional({
    description: 'Observações adicionais'
  })
  observacoes?: string;

  @ApiPropertyOptional({
    description: 'Caminho do arquivo'
  })
  arquivo?: string;

  @ApiPropertyOptional({
    description: 'Nome do arquivo no sistema'
  })
  nomeArquivo?: string;

  @ApiPropertyOptional({
    description: 'Nome original do arquivo'
  })
  nomeArquivoOriginal?: string;

  @ApiPropertyOptional({
    description: 'Tipo do arquivo (extensão)'
  })
  tipoArquivo?: string;

  @ApiPropertyOptional({
    description: 'MIME type do arquivo'
  })
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'Tamanho do arquivo em bytes'
  })
  tamanhoArquivo?: number;

  @ApiPropertyOptional({
    description: 'URL para download do arquivo'
  })
  urlDownload?: string;

  @ApiProperty({
    description: 'ID do veículo',
    example: 'vei_01234567890123456789012345'
  })
  veiculoId: string;

  @ApiProperty({
    description: 'Se a documentação está ativa',
    example: true
  })
  ativo: boolean;

  @ApiProperty({
    description: 'Data de criação',
    example: '2025-01-20T10:00:00.000Z'
  })
  criadoEm: Date;

  @ApiProperty({
    description: 'Data de última atualização',
    example: '2025-01-20T10:00:00.000Z'
  })
  atualizadoEm: Date;

  @ApiPropertyOptional({
    description: 'Nome de quem criou'
  })
  criadoPor?: string;

  @ApiPropertyOptional({
    description: 'ID de quem criou'
  })
  criadoPorId?: string;
}