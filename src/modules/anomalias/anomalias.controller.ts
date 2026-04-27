// src/modules/anomalias/anomalias.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiQuery, ApiBody } from '@nestjs/swagger';
import { Permissions, CurrentUser } from '@aupus/api-shared';
import { AnomaliasService } from './anomalias.service';
import { AnexosAnomaliasService } from './anexos-anomalias.service';
import { 
  CreateAnomaliaDto, 
  UpdateAnomaliaDto, 
  AnomaliaFiltersDto, 
  AnomaliaResponseDto, 
  AnomaliaStatsDto,
  UploadAnexoDto,
  AnexoAnomaliaResponseDto
} from './dto';
import { Response } from 'express';
import * as fs from 'fs';

@ApiTags('Anomalias')
@Controller('anomalias')
export class AnomaliasController {
  constructor(
    private readonly anomaliasService: AnomaliasService,
    private readonly anexosService: AnexosAnomaliasService
  ) {}

  @Post()
  @Permissions('anomalias.manage')
  @ApiOperation({ summary: 'Criar nova anomalia' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Anomalia criada com sucesso',
    type: AnomaliaResponseDto
  })
  async create(
    @Body() createAnomaliaDto: CreateAnomaliaDto,
    @CurrentUser() user: any,
  ) {
    return this.anomaliasService.create(createAnomaliaDto, user);
  }

  @Get()
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Listar anomalias com filtros e paginação' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de anomalias',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/AnomaliaResponseDto' } },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' }
          }
        }
      }
    }
  })
  async findAll(@Query() filters: AnomaliaFiltersDto, @CurrentUser() user: any) {
    return this.anomaliasService.findAll(filters, user);
  }

  @Get('stats')
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Obter estatísticas das anomalias' })
  @ApiQuery({ name: 'periodo', required: false, description: 'Período para filtrar (ex: "Janeiro de 2025")' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Estatísticas das anomalias',
    type: AnomaliaStatsDto 
  })
  async getStats(
    @CurrentUser() user: any,
    @Query('periodo') periodo?: string,
  ): Promise<AnomaliaStatsDto> {
    return this.anomaliasService.getStats(user, periodo);
  }

  @Get(':id')
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Buscar anomalia por ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Anomalia encontrada',
    type: AnomaliaResponseDto 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Anomalia não encontrada' 
  })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.anomaliasService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('anomalias.manage')
  @ApiOperation({ summary: 'Atualizar anomalia' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Anomalia atualizada com sucesso',
    type: AnomaliaResponseDto 
  })
  async update(
    @Param('id') id: string,
    @Body() updateAnomaliaDto: UpdateAnomaliaDto,
    @CurrentUser() user: any,
  ) {
    return this.anomaliasService.update(id, updateAnomaliaDto, user);
  }

  @Delete(':id')
  @Permissions('anomalias.manage')
  @ApiOperation({ summary: 'Remover anomalia (soft delete)' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Anomalia removida com sucesso' 
  })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.anomaliasService.remove(id, user);
  }

  @Get('selects/plantas')
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Listar plantas para select' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de plantas para select',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nome: { type: 'string' }
        }
      }
    }
  })
  async getPlantasSelect(@CurrentUser() user: any) {
    return this.anomaliasService.getPlantasSelect(user);
  }

  @Get('selects/unidades')
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Listar unidades para select' })
  @ApiQuery({ name: 'plantaId', required: false, description: 'Filtrar unidades por planta' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de unidades para select',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nome: { type: 'string' },
          planta: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              nome: { type: 'string' }
            }
          }
        }
      }
    }
  })
  async getUnidadesSelect(
    @CurrentUser() user: any,
    @Query('plantaId') plantaId?: string,
  ) {
    return this.anomaliasService.getUnidadesSelect(user, plantaId);
  }

  @Get('selects/equipamentos')
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Listar equipamentos para select' })
  @ApiQuery({ name: 'plantaId', required: false, description: 'Filtrar equipamentos por planta' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de equipamentos para select',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nome: { type: 'string' },
          planta_id: { type: 'string' },
          planta_nome: { type: 'string' }
        }
      }
    }
  })
  async getEquipamentosSelect(
    @CurrentUser() user: any,
    @Query('plantaId') plantaId?: string,
  ) {
    return this.anomaliasService.getEquipamentosSelect(user, plantaId);
  }

  @Get('selects/usuarios')
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Listar usuários para select' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de usuários para select',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nome: { type: 'string' },
          email: { type: 'string' }
        }
      }
    }
  })
  async getUsuariosSelect() {
    return this.anomaliasService.getUsuariosSelect();
  }

  // ==================== ENDPOINTS DE ANEXOS ====================

  @Post(':id/anexos')
  @Permissions('anomalias.manage')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Fazer upload de anexo para anomalia' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload de arquivo para anomalia',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo a ser enviado (png, pdf, jpg, doc, xls)'
        },
        descricao: {
          type: 'string',
          description: 'Descrição opcional do anexo'
        }
      },
      required: ['file']
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Anexo enviado com sucesso',
    type: AnexoAnomaliaResponseDto 
  })
  async uploadAnexo(
    @Param('id') anomaliaId: string,
    @UploadedFile() file: any,
    @Body() uploadDto: UploadAnexoDto
  ) {
    return this.anexosService.uploadAnexo(
      anomaliaId, 
      file, 
      uploadDto.descricao
    );
  }

  @Get(':id/anexos')
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Listar anexos de uma anomalia' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de anexos da anomalia',
    type: [AnexoAnomaliaResponseDto]
  })
  async listarAnexosAnomalia(@Param('id') anomaliaId: string) {
    return this.anexosService.listarAnexosAnomalia(anomaliaId);
  }

  @Get('anexos/:anexoId')
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Buscar informações de um anexo específico' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Informações do anexo',
    type: AnexoAnomaliaResponseDto
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Anexo não encontrado' 
  })
  async buscarAnexo(@Param('anexoId') anexoId: string) {
    return this.anexosService.buscarAnexo(anexoId);
  }

  @Get('anexos/:anexoId/download')
  @Permissions('anomalias.view')
  @ApiOperation({ summary: 'Fazer download de um anexo' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Download do arquivo iniciado'
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Anexo não encontrado' 
  })
  async downloadAnexo(
    @Param('anexoId') anexoId: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const anexo = await this.anexosService.buscarAnexo(anexoId);
    const caminhoArquivo = await this.anexosService.obterCaminhoArquivo(anexoId);

    // Configurar headers para download
    res.set({
      'Content-Type': anexo.mime_type,
      'Content-Disposition': `attachment; filename="${anexo.nome_original}"`,
      'Content-Length': anexo.tamanho.toString(),
    });

    // Criar stream do arquivo
    const fileStream = fs.createReadStream(caminhoArquivo);
    return new StreamableFile(fileStream);
  }

  @Delete('anexos/:anexoId')
  @Permissions('anomalias.manage')
  @ApiOperation({ summary: 'Remover anexo' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Anexo removido com sucesso' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Anexo não encontrado' 
  })
  async removerAnexo(@Param('anexoId') anexoId: string) {
    await this.anexosService.removerAnexo(anexoId);
    return { message: 'Anexo removido com sucesso' };
  }
}