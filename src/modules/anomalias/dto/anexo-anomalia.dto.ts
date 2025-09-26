import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateAnexoAnomaliaDto {
  @ApiProperty({ description: 'Nome do arquivo' })
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiProperty({ description: 'Nome original do arquivo' })
  @IsString()
  @IsNotEmpty()
  nome_original: string;

  @ApiProperty({ description: 'Tipo do arquivo (extensão)', examples: ['png', 'pdf', 'jpg', 'doc', 'xls'] })
  @IsString()
  @IsNotEmpty()
  tipo: string;

  @ApiProperty({ description: 'MIME type do arquivo' })
  @IsString()
  @IsNotEmpty()
  mime_type: string;

  @ApiProperty({ description: 'Tamanho do arquivo em bytes' })
  @IsNumber()
  tamanho: number;

  @ApiProperty({ description: 'Descrição opcional do anexo', required: false })
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiProperty({ description: 'Caminho do arquivo no S3' })
  @IsString()
  @IsNotEmpty()
  caminho_s3: string;

  @ApiProperty({ description: 'URL para download do arquivo', required: false })
  @IsString()
  @IsOptional()
  url_download?: string;
}

export class AnexoAnomaliaResponseDto {
  @ApiProperty({ description: 'ID único do anexo' })
  id: string;

  @ApiProperty({ description: 'Nome do arquivo' })
  nome: string;

  @ApiProperty({ description: 'Nome original do arquivo' })
  nome_original: string;

  @ApiProperty({ description: 'Tipo do arquivo (extensão)' })
  tipo: string;

  @ApiProperty({ description: 'MIME type do arquivo' })
  mime_type: string;

  @ApiProperty({ description: 'Tamanho do arquivo em bytes' })
  tamanho: number;

  @ApiProperty({ description: 'Descrição do anexo', required: false })
  descricao?: string;

  @ApiProperty({ description: 'Caminho do arquivo no S3' })
  caminho_s3: string;

  @ApiProperty({ description: 'URL para download do arquivo', required: false })
  url_download?: string;

  @ApiProperty({ description: 'ID da anomalia' })
  anomalia_id: string;

  @ApiProperty({ description: 'ID do usuário que fez o upload', required: false })
  usuario_id?: string;

  @ApiProperty({ description: 'Dados do usuário que fez o upload', required: false })
  usuario?: {
    id: string;
    nome: string;
    email: string;
  };

  @ApiProperty({ description: 'Data de criação' })
  created_at: Date;

  @ApiProperty({ description: 'Data de atualização' })
  updated_at: Date;
}

export class UploadAnexoDto {
  @ApiProperty({ description: 'Descrição opcional do anexo', required: false })
  @IsString()
  @IsOptional()
  descricao?: string;
}