import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ExecucaoOSService } from './execucao-os.service';
import { AnexosOSService } from './anexos-os.service';
import {
  OSFiltersDto,
  ProgramarOSDto,
  IniciarExecucaoDto,
  PausarExecucaoDto,
  RetomarExecucaoDto,
  AtualizarChecklistDto,
  RegistrarMateriaisDto,
  RegistrarFerramentasDto,
  ConcluirTarefaDto,
  CancelarTarefaDto,
  FinalizarOSDto,
  CancelarOSDto,
  AdicionarAnexoDto,
  OrdemServicoResponseDto,
  OrdemServicoDetalhesResponseDto,
  ListarOSResponseDto,
  AnexoOSResponseDto,
} from './dto';
import { TipoAnexoOS } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('Execução OS')
@Controller('execucao-os')
// @ApiBearerAuth() // Descomentado quando implementar autenticação
export class ExecucaoOSController {
  constructor(
    private readonly execucaoOSService: ExecucaoOSService,
    private readonly anexosOSService: AnexosOSService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar ordens de serviço',
    description: 'Lista todas as OS com filtros e paginação',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de OS retornada com sucesso',
    type: ListarOSResponseDto,
  })
  @ApiQuery({ name: 'page', required: false, description: 'Página (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items por página (default: 10)' })
  @ApiQuery({ name: 'search', required: false, description: 'Busca em descrição, local, ativo, número OS' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por status' })
  @ApiQuery({ name: 'tipo', required: false, description: 'Filtrar por tipo' })
  @ApiQuery({ name: 'prioridade', required: false, description: 'Filtrar por prioridade' })
  @ApiQuery({ name: 'responsavel', required: false, description: 'Filtrar por responsável' })
  @ApiQuery({ name: 'planta_id', required: false, description: 'Filtrar por planta' })
  @ApiQuery({ name: 'data_inicio', required: false, description: 'Data início (YYYY-MM-DD)' })
  @ApiQuery({ name: 'data_fim', required: false, description: 'Data fim (YYYY-MM-DD)' })
  @ApiQuery({ name: 'atrasadas', required: false, description: 'Filtrar apenas OS atrasadas' })
  async listar(@Query() filters: OSFiltersDto): Promise<ListarOSResponseDto> {
    return this.execucaoOSService.listar(filters);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter OS por ID',
    description: 'Retorna uma OS específica com todos os detalhes',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OS encontrada',
    type: OrdemServicoDetalhesResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'OS não encontrada',
  })
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string): Promise<OrdemServicoDetalhesResponseDto> {
    return this.execucaoOSService.buscarPorId(id);
  }

  @Patch(':id/programar')
  @ApiOperation({
    summary: 'Programar OS',
    description: 'Define data/hora e confirma recursos para a OS',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OS programada com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'OS não está em status adequado para programação',
  })
  async programar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProgramarOSDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.programar(id, dto, usuarioId);
    return { message: 'OS programada com sucesso' };
  }

  @Post('iniciar-de-programacao/:programacao_id')
  @ApiOperation({
    summary: '✅ Criar execução de OS a partir de uma programação APROVADA',
    description: 'Cria uma nova ordem de serviço (execução) a partir de uma programação aprovada, copiando todos os dados (materiais, ferramentas, técnicos, tarefas)',
  })
  @ApiParam({ name: 'programacao_id', description: 'ID da programação aprovada' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Ordem de serviço criada e execução iniciada com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Programação não encontrada',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Programação não está aprovada ou já possui uma OS criada',
  })
  async iniciarDeProgramacao(
    @Param('programacao_id') programacaoId: string,
    @Body() dto: IniciarExecucaoDto,
  ): Promise<{ message: string; os_id: string }> {
    const usuarioId = undefined; // TODO: Obter da sessão
    const result = await this.execucaoOSService.iniciarDeProgramacao(programacaoId, dto, usuarioId);
    return {
      message: 'Ordem de serviço criada e execução iniciada com sucesso',
      os_id: result.os_id
    };
  }

  @Patch(':id/iniciar')
  @ApiOperation({
    summary: 'Iniciar execução da OS',
    description: 'Inicia a execução da OS com equipe definida',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Execução iniciada com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'OS não está programada',
  })
  async iniciar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IniciarExecucaoDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.iniciar(id, dto, usuarioId);
    return { message: 'Execução iniciada com sucesso' };
  }

  @Patch(':id/pausar')
  @ApiOperation({
    summary: 'Pausar execução da OS',
    description: 'Pausa temporariamente a execução da OS',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Execução pausada',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'OS não está em execução',
  })
  async pausar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PausarExecucaoDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.pausar(id, dto, usuarioId);
    return { message: 'Execução pausada' };
  }

  @Patch(':id/retomar')
  @ApiOperation({
    summary: 'Retomar execução da OS',
    description: 'Retoma a execução de uma OS pausada',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Execução retomada',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'OS não está pausada',
  })
  async retomar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetomarExecucaoDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.retomar(id, dto, usuarioId);
    return { message: 'Execução retomada' };
  }

  @Patch(':id/checklist')
  @ApiOperation({
    summary: 'Atualizar checklist da OS',
    description: 'Atualiza o status das atividades do checklist',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Checklist atualizado',
  })
  async atualizarChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarChecklistDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.atualizarChecklist(id, dto, usuarioId);
    return { message: 'Checklist atualizado com sucesso' };
  }

  @Patch(':id/materiais')
  @ApiOperation({
    summary: 'Registrar consumo de materiais',
    description: 'Registra a quantidade consumida de materiais',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Consumo de materiais registrado',
  })
  async registrarMateriais(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarMateriaisDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.registrarMateriais(id, dto, usuarioId);
    return { message: 'Consumo de materiais registrado' };
  }

  @Patch(':id/ferramentas')
  @ApiOperation({
    summary: 'Registrar uso de ferramentas',
    description: 'Registra o uso e condição das ferramentas',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Uso de ferramentas registrado',
  })
  async registrarFerramentas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarFerramentasDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.registrarFerramentas(id, dto, usuarioId);
    return { message: 'Uso de ferramentas registrado' };
  }

  @Get(':id/tarefas')
  @ApiOperation({
    summary: 'Listar tarefas da OS',
    description: 'Lista todas as tarefas associadas à OS',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de tarefas da OS',
  })
  async listarTarefas(@Param('id', ParseUUIDPipe) id: string) {
    const os = await this.execucaoOSService.buscarPorId(id);
    return { tarefas: os.tarefas_os };
  }

  @Patch(':id/tarefas/:tarefaId/concluir')
  @ApiOperation({
    summary: 'Concluir tarefa da OS',
    description: 'Marca uma tarefa específica como concluída',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiParam({ name: 'tarefaId', description: 'ID da tarefa' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tarefa concluída',
  })
  async concluirTarefa(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tarefaId', ParseUUIDPipe) tarefaId: string,
    @Body() dto: ConcluirTarefaDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.concluirTarefa(id, tarefaId, dto, usuarioId);
    return { message: 'Tarefa concluída com sucesso' };
  }

  @Patch(':id/tarefas/:tarefaId/cancelar')
  @ApiOperation({
    summary: 'Cancelar tarefa da OS',
    description: 'Cancela uma tarefa específica da OS',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiParam({ name: 'tarefaId', description: 'ID da tarefa' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tarefa cancelada',
  })
  async cancelarTarefa(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tarefaId', ParseUUIDPipe) tarefaId: string,
    @Body() dto: CancelarTarefaDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.cancelarTarefa(id, tarefaId, dto, usuarioId);
    return { message: 'Tarefa cancelada' };
  }

  @Post(':id/anexos')
  @ApiOperation({
    summary: 'Adicionar anexo à OS',
    description: 'Faz upload de um arquivo anexo à OS',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Anexo adicionado com sucesso',
    type: AnexoOSResponseDto,
  })
  async adicionarAnexo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
    @Body() dto: AdicionarAnexoDto,
    @Query('tipo') tipo: TipoAnexoOS,
  ): Promise<AnexoOSResponseDto> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    return this.anexosOSService.uploadAnexo(
      id,
      file,
      tipo,
      dto.descricao,
      dto.fase_execucao,
      usuarioId,
    );
  }

  @Get(':id/anexos')
  @ApiOperation({
    summary: 'Listar anexos da OS',
    description: 'Lista todos os anexos da OS',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de anexos da OS',
    type: [AnexoOSResponseDto],
  })
  async listarAnexos(@Param('id', ParseUUIDPipe) id: string): Promise<AnexoOSResponseDto[]> {
    return this.anexosOSService.listarAnexosOS(id);
  }

  @Get(':id/anexos/:anexoId')
  @ApiOperation({
    summary: 'Obter anexo específico',
    description: 'Retorna informações de um anexo específico',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Anexo encontrado',
    type: AnexoOSResponseDto,
  })
  async obterAnexo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('anexoId', ParseUUIDPipe) anexoId: string,
  ): Promise<AnexoOSResponseDto> {
    return this.anexosOSService.buscarAnexo(anexoId);
  }

  @Get(':id/anexos/:anexoId/download')
  @ApiOperation({
    summary: 'Download do anexo',
    description: 'Faz download do arquivo anexo',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Arquivo do anexo',
  })
  async downloadAnexo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('anexoId', ParseUUIDPipe) anexoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const anexo = await this.anexosOSService.buscarAnexo(anexoId);
    const caminhoArquivo = await this.anexosOSService.obterCaminhoArquivo(anexoId);

    const file = fs.createReadStream(caminhoArquivo);

    res.set({
      'Content-Type': anexo.mime_type,
      'Content-Disposition': `attachment; filename="${anexo.nome_original}"`,
    });

    return new StreamableFile(file);
  }

  @Delete(':id/anexos/:anexoId')
  @ApiOperation({
    summary: 'Remover anexo',
    description: 'Remove um anexo da OS',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Anexo removido',
  })
  async removerAnexo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('anexoId', ParseUUIDPipe) anexoId: string,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.anexosOSService.removerAnexo(anexoId, usuarioId);
    return { message: 'Anexo removido com sucesso' };
  }

  @Patch(':id/finalizar')
  @ApiOperation({
    summary: 'Finalizar OS',
    description: 'Finaliza a execução da OS com resultados',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OS finalizada com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'OS não pode ser finalizada no status atual',
  })
  async finalizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinalizarOSDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.finalizar(id, dto, usuarioId);
    return { message: 'OS finalizada com sucesso' };
  }

  @Patch(':id/cancelar')
  @ApiOperation({
    summary: 'Cancelar OS',
    description: 'Cancela a OS com motivo',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OS cancelada',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'OS não pode ser cancelada',
  })
  async cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarOSDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.execucaoOSService.cancelar(id, dto, usuarioId);
    return { message: 'OS cancelada' };
  }

  @Get(':id/relatorio')
  @ApiOperation({
    summary: 'Gerar relatório de execução',
    description: 'Gera relatório completo da execução da OS',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Relatório gerado',
  })
  async gerarRelatorio(@Param('id', ParseUUIDPipe) id: string) {
    // TODO: Implementar geração de relatório PDF
    const os = await this.execucaoOSService.buscarPorId(id);
    return { message: 'Relatório em desenvolvimento', os_id: id };
  }
}