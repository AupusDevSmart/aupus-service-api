import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Permissions } from '@aupus/api-shared';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import {
  CreateSolicitacaoDto,
  UpdateSolicitacaoDto,
  SolicitacaoFiltersDto,
  SolicitacaoResponseDto,
  ListarSolicitacoesResponseDto,
  SolicitacaoStatsDto,
  AdicionarComentarioDto,
  GerarProgramacaoOSDto,
} from './dto';

@ApiTags('Solicitações de Serviço')
@Controller('solicitacoes-servico')
@Permissions('manutencao.manage')
export class SolicitacoesServicoController {
  constructor(
    private readonly solicitacoesService: SolicitacoesServicoService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova solicitação de serviço' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Solicitação criada com sucesso',
    type: SolicitacaoResponseDto,
  })
  async create(
    @Body() createDto: CreateSolicitacaoDto,
    @Request() req?: any,
  ): Promise<SolicitacaoResponseDto> {
    const usuarioId = req?.user?.id;
    return this.solicitacoesService.create(createDto, usuarioId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar solicitações com filtros e paginação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de solicitações',
    type: ListarSolicitacoesResponseDto,
  })
  async findAll(
    @Query() filters: SolicitacaoFiltersDto,
  ): Promise<ListarSolicitacoesResponseDto> {
    return this.solicitacoesService.findAll(filters);
  }

  @Get('debug-unidade')
  @ApiOperation({ summary: 'DEBUG - Check last solicitacao unidade data' })
  async debugUnidade(): Promise<any> {
    // Temporary debug endpoint - remove after fixing issue
    const solicitacao = await this.solicitacoesService.debugCheckUnidade();
    return solicitacao;
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas das solicitações' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Estatísticas das solicitações',
    type: SolicitacaoStatsDto,
  })
  async getStats(): Promise<SolicitacaoStatsDto> {
    return this.solicitacoesService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar solicitação por ID' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Solicitação encontrada',
    type: SolicitacaoResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Solicitação não encontrada',
  })
  async findOne(@Param('id') id: string): Promise<SolicitacaoResponseDto> {
    console.log(`[CONTROLLER] GET /solicitacoes-servico/${id} chamado`);
    const result = await this.solicitacoesService.findOne(id);
    console.log('[CONTROLLER] Resposta enviada:', {
      numero: result.numero,
      unidade_id: result.unidade_id,
      hasUnidade: !!result.unidade,
    });
    return result;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar solicitação' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Solicitação atualizada com sucesso',
    type: SolicitacaoResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Solicitação não encontrada',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Solicitação não pode ser editada neste status',
  })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateSolicitacaoDto,
    @Request() req?: any,
  ): Promise<SolicitacaoResponseDto> {
    const usuarioId = req?.user?.id;
    return this.solicitacoesService.update(id, updateDto, usuarioId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover solicitação (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Solicitação removida com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Apenas solicitações registradas podem ser excluídas',
  })
  async remove(
    @Param('id') id: string,
    @Request() req?: any,
  ): Promise<void> {
    const usuarioId = req?.user?.id;
    await this.solicitacoesService.remove(id, usuarioId);
  }

  // =================== COMENTÁRIOS ===================

  @Post(':id/comentarios')
  @ApiOperation({ summary: 'Adicionar comentário à solicitação' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Comentário adicionado com sucesso',
  })
  async adicionarComentario(
    @Param('id') id: string,
    @Body() dto: AdicionarComentarioDto,
  ): Promise<any> {
    return this.solicitacoesService.adicionarComentario(id, dto);
  }

  @Get(':id/comentarios')
  @ApiOperation({ summary: 'Listar comentários da solicitação' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de comentários',
  })
  async listarComentarios(@Param('id') id: string): Promise<any[]> {
    return this.solicitacoesService.listarComentarios(id);
  }

  // =================== GERAÇÃO DE OS ===================

  @Post(':id/gerar-programacao-os')
  @ApiOperation({ summary: 'Gerar programação de OS a partir da solicitação' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Programação de OS gerada com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Apenas solicitações registradas podem gerar OS',
  })
  async gerarProgramacaoOS(
    @Param('id') id: string,
    @Body() dto: GerarProgramacaoOSDto,
    @Request() req?: any,
  ): Promise<any> {
    // Verificar se a solicitação está aprovada
    const solicitacao = await this.solicitacoesService.findOne(id);

    if (solicitacao.status !== 'REGISTRADA') {
      throw new ConflictException('Apenas solicitações registradas podem gerar OS');
    }

    if (solicitacao.programacao_os_id) {
      throw new ConflictException('Esta solicitação já possui uma programação de OS');
    }

    // Por enquanto, retornar mensagem informativa
    // A integração completa será feita através do endpoint /programacao-os/from-solicitacao/:id
    return {
      message: 'Para gerar a OS, use o endpoint POST /programacao-os/from-solicitacao/:id',
      solicitacao_id: id,
      solicitacao_numero: solicitacao.numero,
      status: solicitacao.status,
      ...dto,
    };
  }

  @Get(':id/programacao-os')
  @ApiOperation({ summary: 'Buscar programação de OS gerada' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Programação de OS encontrada',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Programação de OS não encontrada',
  })
  async getProgramacaoOS(@Param('id') id: string): Promise<any> {
    const solicitacao = await this.solicitacoesService.findOne(id);

    if (!solicitacao.programacao_os_id) {
      return {
        message: 'Esta solicitação ainda não possui uma programação de OS',
      };
    }

    return {
      programacao_os_id: solicitacao.programacao_os_id,
      ordem_servico_id: solicitacao.ordem_servico_id,
    };
  }

  // =================== ANEXOS ===================

  @Post(':id/anexos')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload de anexo para a solicitação' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        descricao: {
          type: 'string',
          description: 'Descrição do anexo',
        },
        tipo_documento: {
          type: 'string',
          description: 'Tipo de documento (FOTO, DOCUMENTO, ORCAMENTO, etc)',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Anexo enviado com sucesso',
  })
  async uploadAnexo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Request() req?: any,
  ): Promise<any> {
    if (!file) {
      throw new BadRequestException('Arquivo não fornecido');
    }

    // Por enquanto, retornar mensagem informativa
    // O serviço de anexos será implementado posteriormente
    return {
      message: 'Serviço de anexos será implementado',
      filename: file.originalname,
      solicitacao_id: id,
      descricao: body.descricao,
      tipo_documento: body.tipo_documento,
    };
  }

  @Get(':id/anexos')
  @ApiOperation({ summary: 'Listar anexos da solicitação' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de anexos',
  })
  async listarAnexos(@Param('id') id: string): Promise<any[]> {
    // Por enquanto, retornar lista vazia
    // O serviço de anexos será implementado posteriormente
    return [];
  }

  @Get(':id/anexos/:anexoId')
  @ApiOperation({ summary: 'Buscar anexo específico' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Anexo encontrado',
  })
  async buscarAnexo(
    @Param('id') id: string,
    @Param('anexoId') anexoId: string,
  ): Promise<any> {
    // Por enquanto, retornar mensagem informativa
    // O serviço de anexos será implementado posteriormente
    return { message: 'Serviço de anexos será implementado' };
  }

  @Get(':id/anexos/:anexoId/download')
  @ApiOperation({ summary: 'Download de anexo' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Download do anexo',
  })
  async downloadAnexo(
    @Param('id') id: string,
    @Param('anexoId') anexoId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Por enquanto, retornar mensagem informativa
    // O serviço de anexos será implementado posteriormente
    res.status(HttpStatus.NOT_IMPLEMENTED).json({
      message: 'Serviço de anexos será implementado',
    });
  }

  @Delete(':id/anexos/:anexoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover anexo' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Anexo removido com sucesso',
  })
  async removerAnexo(
    @Param('id') id: string,
    @Param('anexoId') anexoId: string,
    @Request() req?: any,
  ): Promise<void> {
    // Por enquanto, não fazer nada
    // O serviço de anexos será implementado posteriormente
    return;
  }
}