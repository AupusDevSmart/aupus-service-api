// src/modules/instrucoes/instrucoes.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  UseInterceptors,
  UploadedFile,
  Res
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { Permissions } from '@aupus/api-shared';
import { Response } from 'express';
import * as path from 'path';
import { InstrucoesService } from './instrucoes.service';
import { AnexosInstrucoesService } from './anexos-instrucoes.service';
import {
  CreateInstrucaoDto,
  UpdateInstrucaoDto,
  QueryInstrucoesDto,
  UpdateStatusInstrucaoDto,
  InstrucaoResponseDto,
  DashboardInstrucoesDto,
  AdicionarAoPlanoDto,
  AnexoInstrucaoDetalhesDto
} from './dto';

@ApiTags('Instrucoes')
@Controller('instrucoes')
@Permissions('manutencao.manage')
// Quem pode editar anomalias tambem le/associa instrucoes via selector.
// Endpoints GET e a associacao com anomalias aceitam 'anomalias.manage' tambem.
export class InstrucoesController {
  constructor(
    private readonly instrucoesService: InstrucoesService,
    private readonly anexosInstrucoesService: AnexosInstrucoesService
  ) {}

  // ==========================================
  // CRUD Básico
  // ==========================================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar nova instrução' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Instrução criada com sucesso', type: InstrucaoResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'TAG já existe' })
  async criar(@Body() createDto: CreateInstrucaoDto): Promise<InstrucaoResponseDto> {
    return this.instrucoesService.criar(createDto);
  }

  @Get()
  @Permissions('manutencao.manage', 'anomalias.manage')
  @ApiOperation({ summary: 'Listar instruções com filtros e paginação' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de instruções encontrada' })
  async listar(@Query() queryDto: QueryInstrucoesDto) {
    return this.instrucoesService.listar(queryDto);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Obter estatísticas gerais das instruções' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Dashboard obtido com sucesso', type: DashboardInstrucoesDto })
  async obterDashboard(): Promise<DashboardInstrucoesDto> {
    return this.instrucoesService.obterDashboard();
  }

  @Get(':id')
  @Permissions('manutencao.manage', 'anomalias.manage')
  @ApiOperation({ summary: 'Buscar instrução por ID com detalhes completos' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Instrução encontrada', type: InstrucaoResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Instrução não encontrada' })
  async buscarPorId(@Param('id') id: string): Promise<InstrucaoResponseDto> {
    return this.instrucoesService.buscarPorId(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar instrução com sub-instruções e recursos' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Instrução atualizada com sucesso', type: InstrucaoResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Instrução não encontrada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'TAG já existe' })
  async atualizar(
    @Param('id') id: string,
    @Body() updateDto: UpdateInstrucaoDto
  ): Promise<InstrucaoResponseDto> {
    return this.instrucoesService.atualizar(id, updateDto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Atualizar apenas status da instrução' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Status atualizado com sucesso', type: InstrucaoResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Instrução não encontrada' })
  async atualizarStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusInstrucaoDto
  ): Promise<InstrucaoResponseDto> {
    return this.instrucoesService.atualizarStatus(id, updateStatusDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover instrução (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Instrução removida com sucesso' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Instrução não encontrada' })
  async remover(@Param('id') id: string): Promise<void> {
    return this.instrucoesService.remover(id);
  }

  // ==========================================
  // Adicionar ao Plano (gera tarefa)
  // ==========================================

  @Post(':id/adicionar-ao-plano')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar tarefa a partir da instrução e adicionar ao plano de manutenção' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Tarefa criada a partir da instrução' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Instrução ou plano não encontrado' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ordem já em uso no plano' })
  async adicionarAoPlano(
    @Param('id') id: string,
    @Body() dto: AdicionarAoPlanoDto
  ) {
    return this.instrucoesService.adicionarAoPlano(id, dto);
  }

  // ==========================================
  // Tarefas derivadas
  // ==========================================

  @Get(':id/tarefas')
  @ApiOperation({ summary: 'Listar tarefas derivadas desta instrução' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tarefas derivadas encontradas' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Instrução não encontrada' })
  async listarTarefasDerivadas(@Param('id') id: string) {
    return this.instrucoesService.listarTarefasDerivadas(id);
  }

  // ==========================================
  // Associações com Anomalias
  // ==========================================

  @Post(':id/anomalias')
  @Permissions('manutencao.manage', 'anomalias.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Associar anomalia à instrução' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Anomalia associada com sucesso' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Instrução ou anomalia não encontrada' })
  async associarAnomalia(
    @Param('id') id: string,
    @Body() body: { anomalia_id: string; observacoes?: string; created_by?: string }
  ) {
    return this.instrucoesService.associarAnomalia(id, body.anomalia_id, body.observacoes, body.created_by);
  }

  @Get(':id/anomalias')
  @Permissions('manutencao.manage', 'anomalias.manage')
  @ApiOperation({ summary: 'Listar anomalias associadas à instrução' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Anomalias encontradas' })
  async listarAnomalias(@Param('id') id: string) {
    return this.instrucoesService.listarAnomalias(id);
  }

  @Delete(':id/anomalias/:anomaliaId')
  @Permissions('manutencao.manage', 'anomalias.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover associação com anomalia' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiParam({ name: 'anomaliaId', description: 'ID da anomalia' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Associação removida' })
  async desassociarAnomalia(
    @Param('id') id: string,
    @Param('anomaliaId') anomaliaId: string
  ): Promise<void> {
    return this.instrucoesService.desassociarAnomalia(id, anomaliaId);
  }

  // ==========================================
  // Associações com Solicitações de Serviço
  // ==========================================

  @Post(':id/solicitacoes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Associar solicitação de serviço à instrução' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Solicitação associada com sucesso' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Instrução ou solicitação não encontrada' })
  async associarSolicitacao(
    @Param('id') id: string,
    @Body() body: { solicitacao_id: string; observacoes?: string; created_by?: string }
  ) {
    return this.instrucoesService.associarSolicitacao(id, body.solicitacao_id, body.observacoes, body.created_by);
  }

  @Get(':id/solicitacoes')
  @ApiOperation({ summary: 'Listar solicitações associadas à instrução' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Solicitações encontradas' })
  async listarSolicitacoes(@Param('id') id: string) {
    return this.instrucoesService.listarSolicitacoes(id);
  }

  @Delete(':id/solicitacoes/:solicitacaoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover associação com solicitação' })
  @ApiParam({ name: 'id', description: 'ID da instrução' })
  @ApiParam({ name: 'solicitacaoId', description: 'ID da solicitação' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Associação removida' })
  async desassociarSolicitacao(
    @Param('id') id: string,
    @Param('solicitacaoId') solicitacaoId: string
  ): Promise<void> {
    return this.instrucoesService.desassociarSolicitacao(id, solicitacaoId);
  }

  // ==========================================
  // Anexos
  // ==========================================

  @Get(':instrucaoId/anexos')
  @ApiOperation({ summary: 'Listar anexos de uma instrução' })
  @ApiParam({ name: 'instrucaoId', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de anexos encontrada', type: [AnexoInstrucaoDetalhesDto] })
  async listarAnexos(@Param('instrucaoId') instrucaoId: string): Promise<AnexoInstrucaoDetalhesDto[]> {
    return this.anexosInstrucoesService.listarAnexosInstrucao(instrucaoId);
  }

  @Post(':instrucaoId/anexos/upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de anexo para instrução' })
  @ApiParam({ name: 'instrucaoId', description: 'ID da instrução' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Anexo enviado com sucesso', type: AnexoInstrucaoDetalhesDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Arquivo inválido ou muito grande' })
  async uploadAnexo(
    @Param('instrucaoId') instrucaoId: string,
    @UploadedFile() file: any,
    @Body('descricao') descricao?: string,
    @Body('usuario_id') usuarioId?: string
  ): Promise<AnexoInstrucaoDetalhesDto> {
    return this.anexosInstrucoesService.uploadAnexo(instrucaoId, file, descricao, usuarioId);
  }

  @Get(':instrucaoId/anexos/:anexoId/download')
  @ApiOperation({ summary: 'Download de anexo' })
  @ApiParam({ name: 'instrucaoId', description: 'ID da instrução' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Arquivo encontrado' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Anexo ou arquivo não encontrado' })
  async downloadAnexo(
    @Param('instrucaoId') instrucaoId: string,
    @Param('anexoId') anexoId: string,
    @Res() res: Response
  ): Promise<void> {
    const anexo = await this.anexosInstrucoesService.buscarAnexo(anexoId);
    const caminhoArquivo = await this.anexosInstrucoesService.obterCaminhoArquivo(anexoId);

    res.setHeader('Content-Type', anexo.content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${anexo.nome}"`);

    if (anexo.tamanho) {
      res.setHeader('Content-Length', anexo.tamanho);
    }

    res.sendFile(path.resolve(caminhoArquivo));
  }

  @Delete(':instrucaoId/anexos/:anexoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover anexo da instrução' })
  @ApiParam({ name: 'instrucaoId', description: 'ID da instrução' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Anexo removido com sucesso' })
  async removerAnexo(
    @Param('instrucaoId') instrucaoId: string,
    @Param('anexoId') anexoId: string
  ): Promise<void> {
    return this.anexosInstrucoesService.removerAnexo(anexoId);
  }
}
