// src/modules/tarefas/dto/create-anexo-tarefa.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { TipoAnexo } from '@prisma/client';

export class CreateAnexoTarefaDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @IsNotEmpty()
  nome_original: string;

  @IsEnum(TipoAnexo)
  tipo: TipoAnexo;

  @IsString()
  @IsNotEmpty()
  mime_type: string;

  @IsOptional()
  tamanho?: number;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsString()
  @IsNotEmpty()
  caminho_s3: string;

  @IsString()
  @IsNotEmpty()
  url_download: string;
}