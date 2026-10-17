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
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser, Permissions } from '@/core';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ExecucaoOSService } from './execucao-os.service';
import type { PessoasDaOS } from './horas-da-execucao';
import { AnexosOSService, type Solicitante } from './anexos-os.service';
import {
  OSFiltersDto,
  IniciarExecucaoDto,
  PausarExecucaoDto,
  RetomarExecucaoDto,
  AtualizarChecklistDto,
  RegistrarMateriaisDto,
  RegistrarFerramentasDto,
  ConcluirTarefaDto,
  CancelarTarefaDto,
  ExecutarOSDto,
  AuditarOSDto,
  ReabrirOSDto,
  FinalizarOSDto,
  CancelarOSDto,
  AdicionarAnexoDto,
  OrdemServicoDetalhesResponseDto,
  ListarOSResponseDto,
  AnexoOSResponseDto,
} from './dto';
import { TipoAnexoOS } from '@/core';
import * as fs from 'fs';
import { cabecalhosDoDownload } from '@/common/upload/tipo-do-arquivo';

@ApiTags('Execução OS')
@Controller('execucao-os')
@Permissions('execucao_os.view')
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
  async listar(@Query() filters: OSFiltersDto, @CurrentUser() user?: Solicitante): Promise<ListarOSResponseDto> {
    return this.execucaoOSService.listar(filters, user);
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
  async buscarPorId(@Param('id') id: string, @CurrentUser() user?: Solicitante): Promise<OrdemServicoDetalhesResponseDto> {
    return this.execucaoOSService.buscarPorId(id.trim(), user);
  }

  @Patch(':id/iniciar')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
  @ApiOperation({
    summary: 'Iniciar execução da OS',
    description: 'Inicia a execução (PENDENTE → EM_EXECUCAO)',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Execução iniciada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'OS não está pendente' })
  async iniciar(
    @Param('id') id: string,
    @Body() dto: IniciarExecucaoDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.iniciar(id.trim(), dto, user?.id, user);
    return { message: 'Execução iniciada com sucesso' };
  }

  @Patch(':id/pausar')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
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
    @Param('id') id: string,
    @Body() dto: PausarExecucaoDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.pausar(id.trim(), dto, user?.id, user);
    return { message: 'Execução pausada' };
  }

  @Patch(':id/retomar')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
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
    @Param('id') id: string,
    @Body() dto: RetomarExecucaoDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.retomar(id.trim(), dto, user?.id, user);
    return { message: 'Execução retomada' };
  }

  @Patch(':id/checklist')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
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
    @Param('id') id: string,
    @Body() dto: AtualizarChecklistDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.atualizarChecklist(id.trim(), dto, user?.id, user);
    return { message: 'Checklist atualizado com sucesso' };
  }

  @Patch(':id/materiais')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
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
    @Param('id') id: string,
    @Body() dto: RegistrarMateriaisDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.registrarMateriais(id.trim(), dto, user?.id, user);
    return { message: 'Consumo de materiais registrado' };
  }

  @Patch(':id/ferramentas')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
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
    @Param('id') id: string,
    @Body() dto: RegistrarFerramentasDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.registrarFerramentas(id.trim(), dto, user?.id, user);
    return { message: 'Uso de ferramentas registrado' };
  }

  @Get(':id/pessoas')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
  @ApiOperation({
    summary: 'Quem pode entrar na execução',
    description: 'Equipe da planta da OS e apoio (planejador, gerente, administrador): quem pode registrar horas sem estar escalado (SN-61)',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  async pessoas(@Param('id') id: string, @CurrentUser() user?: Solicitante): Promise<PessoasDaOS> {
    return this.execucaoOSService.pessoasQuePodemAtuar(id.trim(), user);
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
  async listarTarefas(@Param('id') id: string, @CurrentUser() user?: Solicitante) {
    const os = await this.execucaoOSService.buscarPorId(id.trim(), user);
    return { tarefas: os.tarefas_os };
  }

  @Patch(':id/tarefas/:tarefaId/concluir')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
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
    @Param('id') id: string,
    @Param('tarefaId') tarefaId: string,
    @Body() dto: ConcluirTarefaDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.concluirTarefa(id.trim(), tarefaId.trim(), dto, user?.id, user);
    return { message: 'Tarefa concluída com sucesso' };
  }

  @Patch(':id/tarefas/:tarefaId/cancelar')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
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
    @Param('id') id: string,
    @Param('tarefaId') tarefaId: string,
    @Body() dto: CancelarTarefaDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.cancelarTarefa(id.trim(), tarefaId.trim(), dto, user?.id, user);
    return { message: 'Tarefa cancelada' };
  }

  @Patch(':id/tarefas/:tarefaId/reabrir')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
  @ApiOperation({
    summary: 'Reabrir tarefa da OS',
    description: 'Desfaz "feita" ou "não feita" enquanto a OS está em execução',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiParam({ name: 'tarefaId', description: 'ID do vínculo (tarefas_os) ou da tarefa' })
  async reabrirTarefa(
    @Param('id') id: string,
    @Param('tarefaId') tarefaId: string,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.reabrirTarefa(id.trim(), tarefaId.trim(), user?.id, user);
    return { message: 'Tarefa reaberta' };
  }

  @Post(':id/anexos')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
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
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AdicionarAnexoDto,
    @Query('tipo') tipo: TipoAnexoOS,
    @CurrentUser() user?: Solicitante,
  ): Promise<AnexoOSResponseDto> {
    return this.anexosOSService.uploadAnexo(id.trim(), file, tipo, dto.descricao, dto.fase_execucao, user, {
      tarefa_os_id: dto.tarefa_os_id,
      checklist_item_id: dto.checklist_item_id,
    });
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
  async listarAnexos(@Param('id') id: string, @CurrentUser() user?: Solicitante): Promise<AnexoOSResponseDto[]> {
    return this.anexosOSService.listarAnexosOS(id.trim(), user);
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
    @Param('id') id: string,
    @Param('anexoId') anexoId: string,
    @CurrentUser() user?: Solicitante,
  ): Promise<AnexoOSResponseDto> {
    return this.anexosOSService.buscarAnexo(id.trim(), anexoId.trim(), user);
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
    @Param('id') id: string,
    @Param('anexoId') anexoId: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: Solicitante,
  ): Promise<StreamableFile> {
    const anexo = await this.anexosOSService.buscarAnexo(id.trim(), anexoId.trim(), user);
    const caminhoArquivo = await this.anexosOSService.obterCaminhoArquivo(id.trim(), anexoId.trim(), user);

    const file = fs.createReadStream(caminhoArquivo);

    // Tipo pela extensão: o mime gravado veio do cliente, e um SVG mandado como
    // "foto.png" voltava como SVG e rodava script na tela (revisão do SN-59)
    res.set(cabecalhosDoDownload(anexo.nome_original));

    return new StreamableFile(file);
  }

  @Delete(':id/anexos/:anexoId')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
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
    @Param('id') id: string,
    @Param('anexoId') anexoId: string,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.anexosOSService.removerAnexo(id.trim(), anexoId.trim(), user);
    return { message: 'Anexo removido com sucesso' };
  }

  @Patch(':id/executar')
  @Permissions('execucao_os.manage', 'execucao_os.executar')
  @ApiOperation({
    summary: 'Marcar OS como executada',
    description: 'EM_EXECUCAO/PAUSADA → EXECUTADA, registra resultados da execução',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({ status: HttpStatus.OK, description: 'OS marcada como executada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'OS não está em execução/pausada' })
  async executar(
    @Param('id') id: string,
    @Body() dto: ExecutarOSDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.executar(id.trim(), dto, user?.id, user);
    return { message: 'OS marcada como executada' };
  }

  @Patch(':id/auditar')
  @Permissions('execucao_os.manage')
  @ApiOperation({
    summary: 'Auditar OS',
    description: 'EXECUTADA → AUDITADA, avaliação de qualidade',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({ status: HttpStatus.OK, description: 'OS auditada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'OS não está executada' })
  async auditar(
    @Param('id') id: string,
    @Body() dto: AuditarOSDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.auditar(id.trim(), dto, user?.id, user);
    return { message: 'OS auditada com sucesso' };
  }

  @Patch(':id/reabrir')
  @Permissions('execucao_os.manage')
  @ApiOperation({
    summary: 'Reabrir OS',
    description: 'AUDITADA → EM_EXECUCAO, reabre para correções',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({ status: HttpStatus.OK, description: 'OS reaberta' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'OS não está auditada' })
  async reabrir(
    @Param('id') id: string,
    @Body() dto: ReabrirOSDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.reabrir(id.trim(), dto, user?.id, user);
    return { message: 'OS reaberta para execução' };
  }

  @Patch(':id/finalizar')
  @Permissions('execucao_os.aprovar')
  @ApiOperation({
    summary: 'Finalizar OS',
    description: 'AUDITADA → FINALIZADA, finalização definitiva',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({ status: HttpStatus.OK, description: 'OS finalizada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'OS não está auditada' })
  async finalizar(
    @Param('id') id: string,
    @Body() dto: FinalizarOSDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.finalizar(id.trim(), dto, user?.id, user);
    return { message: 'OS finalizada com sucesso' };
  }

  @Patch(':id/cancelar')
  @Permissions('execucao_os.cancelar')
  @ApiOperation({
    summary: 'Cancelar OS',
    description: 'Cancela a OS (não pode cancelar FINALIZADA/CANCELADA)',
  })
  @ApiParam({ name: 'id', description: 'ID da OS' })
  @ApiResponse({ status: HttpStatus.OK, description: 'OS cancelada' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'OS não pode ser cancelada' })
  async cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarOSDto,
    @CurrentUser() user?: Solicitante,
  ): Promise<{ message: string }> {
    await this.execucaoOSService.cancelar(id.trim(), dto, user?.id, user);
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
  async gerarRelatorio(@Param('id') id: string, @CurrentUser() user?: Solicitante) {
    // TODO: Implementar geração de relatório PDF
    // Com o escopo de quem pede: sem ele, a rota dizia se a OS de outra planta existe
    await this.execucaoOSService.buscarPorId(id.trim(), user);
    return { message: 'Relatório em desenvolvimento', os_id: id.trim() };
  }
}