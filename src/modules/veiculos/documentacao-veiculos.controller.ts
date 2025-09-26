import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Res,
  ParseIntPipe
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { DocumentacaoVeiculosService } from './documentacao-veiculos.service';
import {
  CreateDocumentacaoVeiculoDto,
  UpdateDocumentacaoVeiculoDto,
  DocumentacaoVeiculoResponseDto
} from './dto';
import * as path from 'path';

@ApiTags('Documentação de Veículos')
@Controller('veiculos/:veiculoId/documentacao')
export class DocumentacaoVeiculosController {
  constructor(private readonly documentacaoService: DocumentacaoVeiculosService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova documentação para veículo' })
  @ApiResponse({
    status: 201,
    description: 'Documentação criada com sucesso',
    type: DocumentacaoVeiculoResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Veículo não encontrado'
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe documentação ativa do mesmo tipo'
  })
  async criarDocumentacao(
    @Param('veiculoId') veiculoId: string,
    @Body() createDto: CreateDocumentacaoVeiculoDto
  ): Promise<DocumentacaoVeiculoResponseDto> {
    return this.documentacaoService.criarDocumentacao(veiculoId, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar documentação do veículo' })
  @ApiResponse({
    status: 200,
    description: 'Lista de documentação retornada com sucesso',
    type: [DocumentacaoVeiculoResponseDto]
  })
  @ApiQuery({ name: 'incluirInativos', required: false, type: Boolean, description: 'Incluir documentação inativa' })
  async listarDocumentacao(
    @Param('veiculoId') veiculoId: string,
    @Query('incluirInativos') incluirInativos?: boolean
  ): Promise<DocumentacaoVeiculoResponseDto[]> {
    return this.documentacaoService.listarPorVeiculo(veiculoId, incluirInativos);
  }

  @Get('vencendo')
  @ApiOperation({ summary: 'Listar documentação vencendo em breve' })
  @ApiResponse({
    status: 200,
    description: 'Lista de documentação vencendo retornada com sucesso',
    type: [DocumentacaoVeiculoResponseDto]
  })
  @ApiQuery({ name: 'dias', required: false, type: Number, description: 'Número de dias para vencimento (padrão: 30)' })
  async listarVencendo(
    @Param('veiculoId') veiculoId: string,
    @Query('dias', new ParseIntPipe({ optional: true })) dias?: number
  ): Promise<DocumentacaoVeiculoResponseDto[]> {
    return this.documentacaoService.listarVencendoEm(dias || 30, veiculoId);
  }

  @Get('vencidas')
  @ApiOperation({ summary: 'Listar documentação vencida' })
  @ApiResponse({
    status: 200,
    description: 'Lista de documentação vencida retornada com sucesso',
    type: [DocumentacaoVeiculoResponseDto]
  })
  async listarVencidas(
    @Param('veiculoId') veiculoId: string
  ): Promise<DocumentacaoVeiculoResponseDto[]> {
    return this.documentacaoService.listarVencidas(veiculoId);
  }

  @Get('alertas/count')
  @ApiOperation({ summary: 'Contar alertas de documentação' })
  @ApiResponse({
    status: 200,
    description: 'Número de alertas',
    schema: { type: 'object', properties: { count: { type: 'number' } } }
  })
  async contarAlertas(
    @Param('veiculoId') veiculoId: string
  ): Promise<{ count: number }> {
    const count = await this.documentacaoService.contarAlertas(veiculoId);
    return { count };
  }

  @Get(':documentacaoId')
  @ApiOperation({ summary: 'Buscar documentação por ID' })
  @ApiResponse({
    status: 200,
    description: 'Documentação encontrada',
    type: DocumentacaoVeiculoResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Documentação não encontrada'
  })
  async buscarDocumentacao(
    @Param('documentacaoId') documentacaoId: string
  ): Promise<DocumentacaoVeiculoResponseDto> {
    return this.documentacaoService.buscarPorId(documentacaoId);
  }

  @Put(':documentacaoId')
  @ApiOperation({ summary: 'Atualizar documentação' })
  @ApiResponse({
    status: 200,
    description: 'Documentação atualizada com sucesso',
    type: DocumentacaoVeiculoResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Documentação não encontrada'
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito com documentação existente'
  })
  async atualizarDocumentacao(
    @Param('documentacaoId') documentacaoId: string,
    @Body() updateDto: UpdateDocumentacaoVeiculoDto
  ): Promise<DocumentacaoVeiculoResponseDto> {
    return this.documentacaoService.atualizar(documentacaoId, updateDto);
  }

  @Post(':documentacaoId/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload de arquivo para documentação' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Arquivo de documentação',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Arquivo enviado com sucesso',
    type: DocumentacaoVeiculoResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Arquivo inválido'
  })
  @ApiResponse({
    status: 404,
    description: 'Documentação não encontrada'
  })
  async uploadArquivo(
    @Param('documentacaoId') documentacaoId: string,
    @UploadedFile() file: any
  ): Promise<DocumentacaoVeiculoResponseDto> {
    return this.documentacaoService.uploadArquivo(documentacaoId, file);
  }

  @Get(':documentacaoId/download')
  @ApiOperation({ summary: 'Download do arquivo de documentação' })
  @ApiResponse({
    status: 200,
    description: 'Arquivo retornado com sucesso'
  })
  @ApiResponse({
    status: 404,
    description: 'Arquivo não encontrado'
  })
  async downloadArquivo(
    @Param('documentacaoId') documentacaoId: string,
    @Res() res: Response
  ): Promise<void> {
    const caminhoArquivo = await this.documentacaoService.obterCaminhoArquivo(documentacaoId);
    const documentacao = await this.documentacaoService.buscarPorId(documentacaoId);

    const nomeDownload = documentacao.nomeArquivoOriginal || documentacao.nomeArquivo || 'documento';
    const mimeType = documentacao.mimeType || 'application/octet-stream';

    res.setHeader('Content-Disposition', `attachment; filename="${nomeDownload}"`);
    res.setHeader('Content-Type', mimeType);

    res.sendFile(caminhoArquivo);
  }

  @Delete(':documentacaoId/inativar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Inativar documentação' })
  @ApiResponse({
    status: 204,
    description: 'Documentação inativada com sucesso'
  })
  @ApiResponse({
    status: 404,
    description: 'Documentação não encontrada'
  })
  async inativarDocumentacao(
    @Param('documentacaoId') documentacaoId: string
  ): Promise<void> {
    return this.documentacaoService.inativar(documentacaoId);
  }

  @Delete(':documentacaoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover documentação permanentemente' })
  @ApiResponse({
    status: 204,
    description: 'Documentação removida com sucesso'
  })
  @ApiResponse({
    status: 404,
    description: 'Documentação não encontrada'
  })
  async removerDocumentacao(
    @Param('documentacaoId') documentacaoId: string
  ): Promise<void> {
    return this.documentacaoService.remover(documentacaoId);
  }
}

// Controller global para endpoints de documentação que não precisam de veiculoId específico
@ApiTags('Documentação de Veículos')
@Controller('documentacao/veiculos')
export class DocumentacaoVeiculosGlobalController {
  constructor(private readonly documentacaoService: DocumentacaoVeiculosService) {}

  @Get('vencendo')
  @ApiOperation({ summary: 'Listar toda documentação vencendo em breve' })
  @ApiResponse({
    status: 200,
    description: 'Lista de documentação vencendo retornada com sucesso',
    type: [DocumentacaoVeiculoResponseDto]
  })
  @ApiQuery({ name: 'dias', required: false, type: Number, description: 'Número de dias para vencimento (padrão: 30)' })
  async listarTodaVencendo(
    @Query('dias', new ParseIntPipe({ optional: true })) dias?: number
  ): Promise<DocumentacaoVeiculoResponseDto[]> {
    return this.documentacaoService.listarVencendoEm(dias || 30);
  }

  @Get('vencidas')
  @ApiOperation({ summary: 'Listar toda documentação vencida' })
  @ApiResponse({
    status: 200,
    description: 'Lista de documentação vencida retornada com sucesso',
    type: [DocumentacaoVeiculoResponseDto]
  })
  async listarTodaVencida(): Promise<DocumentacaoVeiculoResponseDto[]> {
    return this.documentacaoService.listarVencidas();
  }
}