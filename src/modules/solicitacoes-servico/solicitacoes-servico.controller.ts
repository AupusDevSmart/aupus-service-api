import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
  Request,
  ConflictException,
  NotImplementedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Permissions, ScopedUser, StatusSolicitacaoServico } from '@/core';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';
import {
  CreateSolicitacaoDto,
  UpdateSolicitacaoDto,
  SolicitacaoFiltersDto,
  SolicitacaoResponseDto,
  ListarSolicitacoesResponseDto,
  SolicitacaoStatsDto,
  GerarProgramacaoOSDto,
  BdiPadraoDto,
  CondicoesDaPropostaDto,
  SalvarItensDaPropostaDto,
  SalvarOutrosCustosDaPropostaDto,
} from './dto';

const ANEXOS_AINDA_NAO_EXISTEM = 'O anexo de solicitação ainda não existe: anexe as fotos e os documentos na OS.';

/** O que este controller lê da requisição: o usuário que a JwtStrategy pôs nela */
type RequisicaoAutenticada = { user?: ScopedUser };

@ApiTags('Solicitações de Serviço')
@Controller('solicitacoes-servico')
// Ler: quem abre também acompanha (no escopo dele). Escrever: solicitacoes.manage.
@Permissions('solicitacoes.view', 'solicitacoes.manage')
export class SolicitacoesServicoController {
  constructor(
    private readonly solicitacoesService: SolicitacoesServicoService,
    private readonly propostaService: PropostaService,
  ) {}

  @Post()
  @Permissions('solicitacoes.manage', 'solicitacoes.create')
  @ApiOperation({ summary: 'Criar nova solicitação de serviço' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Solicitação criada com sucesso',
    type: SolicitacaoResponseDto,
  })
  async create(
    @Body() createDto: CreateSolicitacaoDto,
    @Request() req?: RequisicaoAutenticada,
  ): Promise<SolicitacaoResponseDto> {
    const usuarioId = req?.user?.id;
    return this.solicitacoesService.create(createDto, usuarioId, req?.user);
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
    @Request() req?: RequisicaoAutenticada,
  ): Promise<ListarSolicitacoesResponseDto> {
    return this.solicitacoesService.findAll(filters, req?.user);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas das solicitações' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Estatísticas das solicitações',
    type: SolicitacaoStatsDto,
  })
  async getStats(@Request() req?: RequisicaoAutenticada): Promise<SolicitacaoStatsDto> {
    return this.solicitacoesService.getStats(req?.user);
  }

  // O BDI padrão da empresa (28/out/2026): a solicitação nova copia daqui, e
  // cada uma ajusta o seu no fechamento. Antes do ':id', que o capturaria.
  // Só quem monta proposta (o lucro e a administração são a margem da empresa:
  // o cliente, que tem solicitacoes.create, não lê)
  @Get('bdi-padrao')
  @Permissions('solicitacoes.manage')
  @ApiOperation({ summary: 'O BDI padrão da empresa (os nove componentes e o percentual)' })
  async obterBdiPadrao() {
    return this.propostaService.obterBdiPadrao();
  }

  @Put('bdi-padrao')
  @Permissions('solicitacoes.manage')
  @ApiOperation({ summary: 'Trocar o BDI padrão: vale para as solicitações novas' })
  @ApiBody({ type: BdiPadraoDto })
  async salvarBdiPadrao(@Body() body: BdiPadraoDto, @Request() req?: RequisicaoAutenticada) {
    return this.propostaService.salvarBdiPadrao(body, req?.user?.id);
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
  async findOne(@Param('id') id: string, @Request() req?: RequisicaoAutenticada): Promise<SolicitacaoResponseDto> {
    console.log(`[CONTROLLER] GET /solicitacoes-servico/${id} chamado`);
    const result = await this.solicitacoesService.findOne(id, req?.user);
    console.log('[CONTROLLER] Resposta enviada:', {
      numero: result.numero,
      unidade_id: result.unidade_id,
      hasUnidade: !!result.unidade,
    });
    return result;
  }

  @Patch(':id')
  @Permissions('solicitacoes.manage')
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
    @Request() req?: RequisicaoAutenticada,
  ): Promise<SolicitacaoResponseDto> {
    const usuarioId = req?.user?.id;
    return this.solicitacoesService.update(id, updateDto, usuarioId, req?.user);
  }

  @Delete(':id')
  @Permissions('solicitacoes.manage')
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
    @Request() req?: RequisicaoAutenticada,
  ): Promise<void> {
    // Com o usuário: sem ele o findOne não conferia o escopo, e quem tinha solicitacoes.manage numa
    // planta excluía a solicitação de outra pelo id (achado no SN-94)
    await this.solicitacoesService.remove(id, req?.user?.id, req?.user);
  }

  // Comentários: ComentariosDaSolicitacaoController (modules/comentarios, SN-48)

  // =================== GERAÇÃO DE OS ===================

  @Post(':id/gerar-programacao-os')
  @Permissions('solicitacoes.manage')
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
    @Request() req?: RequisicaoAutenticada,
  ): Promise<
    { message: string; solicitacao_id: string; solicitacao_numero: string; status: StatusSolicitacaoServico } & GerarProgramacaoOSDto
  > {
    // Verificar se a solicitação está aprovada
    const solicitacao = await this.solicitacoesService.findOne(id, req?.user);

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
  async getProgramacaoOS(
    @Param('id') id: string,
    @Request() req?: RequisicaoAutenticada,
  ): Promise<{ message: string } | { programacao_os_id: string; ordem_servico_id: string }> {
    // No escopo de quem pede: sem o user, devolvia a programação e a OS de qualquer planta (SN-40)
    const solicitacao = await this.solicitacoesService.findOne(id, req?.user);

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
  //
  // Ainda não existem (a solicitação não guarda arquivo). As rotas dizem isso
  // com 501: o upload respondia 201 sem gravar nada e o remover, 204 "Anexo
  // removido com sucesso" sem remover (SN-94). A lista é vazia, e é verdade.

  @Post(':id/anexos')
  @Permissions('solicitacoes.manage', 'solicitacoes.create')
  @ApiOperation({ summary: 'Upload de anexo para a solicitação (ainda não existe: 501)' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({ status: HttpStatus.NOT_IMPLEMENTED, description: 'Anexo de solicitação ainda não existe' })
  uploadAnexo(): never {
    throw new NotImplementedException(ANEXOS_AINDA_NAO_EXISTEM);
  }

  @Get(':id/anexos')
  @ApiOperation({ summary: 'Listar anexos da solicitação' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de anexos (sempre vazia: o anexo de solicitação ainda não existe)',
  })
  async listarAnexos(): Promise<unknown[]> {
    return [];
  }

  @Get(':id/anexos/:anexoId')
  @ApiOperation({ summary: 'Buscar anexo específico (ainda não existe: 501)' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({ status: HttpStatus.NOT_IMPLEMENTED, description: 'Anexo de solicitação ainda não existe' })
  buscarAnexo(): never {
    throw new NotImplementedException(ANEXOS_AINDA_NAO_EXISTEM);
  }

  @Get(':id/anexos/:anexoId/download')
  @ApiOperation({ summary: 'Download de anexo (ainda não existe: 501)' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({ status: HttpStatus.NOT_IMPLEMENTED, description: 'Anexo de solicitação ainda não existe' })
  downloadAnexo(): never {
    throw new NotImplementedException(ANEXOS_AINDA_NAO_EXISTEM);
  }

  @Delete(':id/anexos/:anexoId')
  @Permissions('solicitacoes.manage')
  @ApiOperation({ summary: 'Remover anexo (ainda não existe: 501)' })
  @ApiParam({ name: 'id', description: 'ID da solicitação' })
  @ApiParam({ name: 'anexoId', description: 'ID do anexo' })
  @ApiResponse({ status: HttpStatus.NOT_IMPLEMENTED, description: 'Anexo de solicitação ainda não existe' })
  removerAnexo(): never {
    throw new NotImplementedException(ANEXOS_AINDA_NAO_EXISTEM);
  }

  // ==========================================================================
  // PROPOSTA COMERCIAL
  //
  // Itens, outros custos e os componentes do BDI. Os totais sao calculados e
  // GRAVADOS pelo servico a cada escrita: a tela, a listagem e o PDF precisam
  // do mesmo numero, e recalcular em tres lugares e como eles comecam a
  // divergir.
  //
  // Toda escrita confere o escopo, como a leitura (SN-94): antes, quem tinha
  // solicitacoes.manage numa planta reescrevia a proposta de qualquer outra
  // pelo id. Fora do escopo e 404, com a mensagem do que nao existe.
  // ==========================================================================

  @Get(':id/proposta')
  @ApiOperation({ summary: 'Itens, custos e totais da proposta' })
  async obterProposta(@Param('id') id: string, @Request() req?: RequisicaoAutenticada) {
    await this.solicitacoesService.garantirNoEscopo(id, req?.user);
    return this.propostaService.obter(id);
  }

  @Put(':id/proposta/itens')
  @Permissions('solicitacoes.manage')
  @ApiOperation({
    summary: 'Substitui a lista de itens — uma linha por instrucao vinculada',
    description:
      'O front manda o estado final da lista. Recalcula os totais em seguida.',
  })
  async salvarItensDaProposta(@Param('id') id: string, @Body() body: SalvarItensDaPropostaDto, @Request() req?: RequisicaoAutenticada) {
    await this.solicitacoesService.garantirNoEscopo(id, req?.user);
    return this.propostaService.salvarItens(id, body.itens);
  }

  @Put(':id/proposta/outros-custos')
  @Permissions('solicitacoes.manage')
  @ApiOperation({ summary: 'Substitui a lista de outros custos' })
  async salvarOutrosCustos(@Param('id') id: string, @Body() body: SalvarOutrosCustosDaPropostaDto, @Request() req?: RequisicaoAutenticada) {
    await this.solicitacoesService.garantirNoEscopo(id, req?.user);
    return this.propostaService.salvarOutrosCustos(id, body.custos);
  }

  @Put(':id/proposta/condicoes')
  @Permissions('solicitacoes.manage')
  @ApiOperation({
    summary: 'Componentes do BDI',
    description:
      'Aceita bdi_regime e os nove percentuais. Recalcula os totais em seguida.',
  })
  async salvarCondicoes(@Param('id') id: string, @Body() body: CondicoesDaPropostaDto, @Request() req?: RequisicaoAutenticada) {
    await this.solicitacoesService.garantirNoEscopo(id, req?.user);
    return this.propostaService.salvarCondicoes(id, body);
  }

  @Post(':id/proposta/recarregar')
  @Permissions('solicitacoes.manage')
  @ApiOperation({
    summary: 'Refaz a copia a partir das instrucoes vinculadas',
    description:
      'DESCARTA as edicoes de preco dos itens que vieram de instrucao — quem ' +
      'recarrega esta redefinindo o escopo. Itens avulsos sobrevivem.',
  })
  async recarregarProposta(@Param('id') id: string, @Request() req?: RequisicaoAutenticada) {
    await this.solicitacoesService.garantirNoEscopo(id, req?.user);
    return this.propostaService.recarregar(id);
  }
}