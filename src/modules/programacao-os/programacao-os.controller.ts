import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ParseULIDPipe } from '../../shared/pipes/parse-ulid.pipe';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger';
import {
  AdicionarTarefasDto,
  AnalisarProgramacaoDto,
  AprovarProgramacaoDto,
  AtualizarTarefasDto,
  CancelarProgramacaoDto,
  CreateProgramacaoAnomaliaDto,
  CreateProgramacaoDto,
  CreateProgramacaoTarefasDto,
  ListarProgramacoesResponseDto,
  ProgramacaoDetalhesResponseDto,
  ProgramacaoFiltersDto,
  ProgramacaoResponseDto,
  RejeitarProgramacaoDto,
  UpdateProgramacaoDto,
} from './dto';
import { ProgramacaoOSService } from './programacao-os.service';

@ApiTags('Programação OS')
@Controller('programacao-os')
// @ApiBearerAuth() // Descomentado quando implementar autenticação
export class ProgramacaoOSController {
  private readonly logger = new Logger(ProgramacaoOSController.name);

  constructor(private readonly programacaoOSService: ProgramacaoOSService) { }

  @Get()
  @ApiOperation({
    summary: 'Listar programações de OS',
    description: 'Lista todas as programações com filtros e paginação',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de programações retornada com sucesso',
    type: ListarProgramacoesResponseDto,
  })
  @ApiQuery({ name: 'page', required: false, description: 'Página (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items por página (default: 10)' })
  @ApiQuery({ name: 'search', required: false, description: 'Busca em descrição, local, ativo' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por status' })
  @ApiQuery({ name: 'tipo', required: false, description: 'Filtrar por tipo' })
  @ApiQuery({ name: 'prioridade', required: false, description: 'Filtrar por prioridade' })
  @ApiQuery({ name: 'origem', required: false, description: 'Filtrar por origem' })
  @ApiQuery({ name: 'planta_id', required: false, description: 'Filtrar por planta' })
  @ApiQuery({ name: 'data_inicio', required: false, description: 'Data início (YYYY-MM-DD)' })
  @ApiQuery({ name: 'data_fim', required: false, description: 'Data fim (YYYY-MM-DD)' })
  @ApiQuery({ name: 'criado_por_id', required: false, description: 'Filtrar por criador' })
  async listar(@Query() filters: ProgramacaoFiltersDto): Promise<ListarProgramacoesResponseDto> {
    return this.programacaoOSService.listar(filters);
  }

  @Post()
  @ApiOperation({
    summary: 'Criar nova programação',
    description: 'Cria uma nova programação de ordem de serviço',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Programação criada com sucesso',
    type: ProgramacaoResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dados inválidos',
  })
  
  async criar(@Body() createDto: CreateProgramacaoDto): Promise<ProgramacaoResponseDto> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    return this.programacaoOSService.criar(createDto, usuarioId);
  }

  @Get('por-unidade/:unidadeId')
  @ApiOperation({
    summary: 'Buscar programações por unidade',
    description: 'Lista programações filtradas por unidade específica',
  })
  @ApiParam({ name: 'unidadeId', description: 'ID da unidade' })
  @ApiQuery({ name: 'page', required: false, description: 'Página (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items por página (default: 10)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por status' })
  @ApiQuery({ name: 'tipo', required: false, description: 'Filtrar por tipo' })
  @ApiQuery({ name: 'prioridade', required: false, description: 'Filtrar por prioridade' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Programações da unidade encontradas',
    type: ListarProgramacoesResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Unidade não encontrada',
  })
  async buscarPorUnidade(
    @Param('unidadeId') unidadeId: string,
    @Query() filters?: Partial<ProgramacaoFiltersDto>
  ): Promise<ListarProgramacoesResponseDto> {
    return this.programacaoOSService.buscarPorUnidade(unidadeId, filters);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter programação por ID',
    description: 'Retorna uma programação específica com todos os detalhes',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Programação encontrada',
    type: ProgramacaoDetalhesResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Programação não encontrada',
  })
  async buscarPorId(@Param('id', ParseULIDPipe) id: string): Promise<ProgramacaoDetalhesResponseDto> {
    return this.programacaoOSService.buscarPorId(id);
  }



  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar programação',
    description: 'Atualiza uma programação existente (apenas status RASCUNHO ou PENDENTE)',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Programação atualizada com sucesso',
    type: ProgramacaoResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Programação não encontrada',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Programação não pode ser editada neste status',
  })
  async atualizar(
    @Param('id', ParseULIDPipe) id: string,
    @Body() updateDto: UpdateProgramacaoDto,
  ): Promise<ProgramacaoResponseDto> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    return this.programacaoOSService.atualizar(id, updateDto, usuarioId);
  }

  @Patch(':id/analisar')
  @ApiOperation({
    summary: 'Iniciar análise da programação',
    description: 'Muda o status para EM_ANALISE',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Análise iniciada com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Programação não está em status adequado para análise',
  })
  async analisar(
    @Param('id', ParseULIDPipe) id: string,
    @Body() dto: AnalisarProgramacaoDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.programacaoOSService.analisar(id, dto, usuarioId);
    return { message: 'Análise iniciada com sucesso' };
  }

  @Patch(':id/aprovar')
  @ApiOperation({
    summary: 'Aprovar programação',
    description: 'Aprova a programação e gera automaticamente a OS',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Programação aprovada e OS gerada',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Programação não está em análise',
  })
  async aprovar(
    @Param('id', ParseULIDPipe) id: string,
    @Body() dto: AprovarProgramacaoDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.programacaoOSService.aprovar(id, dto, usuarioId);
    return { message: 'Programação aprovada e OS gerada com sucesso' };
  }

  @Patch(':id/rejeitar')
  @ApiOperation({
    summary: 'Rejeitar programação',
    description: 'Rejeita a programação com motivo',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Programação rejeitada',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Programação não está em análise',
  })
  async rejeitar(
    @Param('id', ParseULIDPipe) id: string,
    @Body() dto: RejeitarProgramacaoDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.programacaoOSService.rejeitar(id, dto, usuarioId);
    return { message: 'Programação rejeitada' };
  }

  @Patch(':id/cancelar')
  @ApiOperation({
    summary: 'Cancelar programação',
    description: 'Cancela a programação com motivo',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Programação cancelada',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Programação não pode ser cancelada',
  })
  async cancelar(
    @Param('id', ParseULIDPipe) id: string,
    @Body() dto: CancelarProgramacaoDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.programacaoOSService.cancelar(id, dto, usuarioId);
    return { message: 'Programação cancelada' };
  }

  @Post('from-anomalia/:anomaliaId')
  @ApiOperation({
    summary: 'Criar programação a partir de anomalia',
    description: 'Cria automaticamente uma programação baseada em dados da anomalia',
  })
  @ApiParam({ name: 'anomaliaId', description: 'ID da anomalia' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Programação criada a partir da anomalia',
    type: ProgramacaoResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Anomalia não encontrada',
  })
  async criarDeAnomalia(
    @Param('anomaliaId', ParseULIDPipe) anomaliaId: string,
    @Body() dto: CreateProgramacaoAnomaliaDto,
  ): Promise<ProgramacaoResponseDto> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    return this.programacaoOSService.criarDeAnomalia(anomaliaId, dto, usuarioId);
  }

  @Post('from-tarefas')
  @ApiOperation({
    summary: 'Criar programação de múltiplas tarefas',
    description: 'Cria uma programação englobando múltiplas tarefas',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Programação criada com múltiplas tarefas',
    type: ProgramacaoResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Uma ou mais tarefas não encontradas',
  })
  async criarDeTarefas(@Body() dto: CreateProgramacaoTarefasDto): Promise<ProgramacaoResponseDto> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    return this.programacaoOSService.criarDeTarefas(dto, usuarioId);
  }

  @Post(':id/tarefas')
  @ApiOperation({
    summary: 'Adicionar tarefas à programação',
    description: 'Adiciona novas tarefas a uma programação existente',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tarefas adicionadas com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Uma ou mais tarefas já estão associadas',
  })
  async adicionarTarefas(
    @Param('id', ParseULIDPipe) id: string,
    @Body() dto: AdicionarTarefasDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.programacaoOSService.adicionarTarefasProgramacao(id, dto, usuarioId);
    return { message: 'Tarefas adicionadas com sucesso' };
  }

  @Patch(':id/tarefas')
  @ApiOperation({
    summary: 'Atualizar tarefas da programação',
    description: 'Atualiza ordem, status e observações das tarefas',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tarefas atualizadas com sucesso',
  })
  async atualizarTarefas(
    @Param('id', ParseULIDPipe) id: string,
    @Body() dto: AtualizarTarefasDto,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.programacaoOSService.atualizarTarefasProgramacao(id, dto, usuarioId);
    return { message: 'Tarefas atualizadas com sucesso' };
  }

  @Delete(':id/tarefas/:tarefaId')
  @ApiOperation({
    summary: 'Remover tarefa da programação',
    description: 'Remove uma tarefa específica da programação',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiParam({ name: 'tarefaId', description: 'ID da tarefa' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tarefa removida com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Tarefa não encontrada na programação',
  })
  async removerTarefa(
    @Param('id', ParseULIDPipe) id: string,
    @Param('tarefaId', ParseULIDPipe) tarefaId: string,
  ): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.programacaoOSService.removerTarefaProgramacao(id, tarefaId, usuarioId);
    return { message: 'Tarefa removida com sucesso' };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deletar programação',
    description: 'Deleta uma programação (soft delete)',
  })
  @ApiParam({ name: 'id', description: 'ID da programação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Programação deletada com sucesso',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Programações aprovadas não podem ser deletadas',
  })
  async deletar(@Param('id', ParseULIDPipe) id: string): Promise<{ message: string }> {
    // TODO: Obter usuarioId da sessão quando implementar autenticação
    const usuarioId = undefined;
    await this.programacaoOSService.deletar(id, usuarioId);
    return { message: 'Programação deletada com sucesso' };
  }
}