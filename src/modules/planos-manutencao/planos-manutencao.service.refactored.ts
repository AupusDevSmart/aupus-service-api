// src/modules/planos-manutencao/planos-manutencao.service.ts - REFATORADO
import { Injectable } from '@nestjs/common';
import {
  CreatePlanoManutencaoDto,
  UpdatePlanoManutencaoDto,
  UpdateStatusPlanoDto,
  QueryPlanosDto,
  QueryPlanosPorPlantaDto,
  DuplicarPlanoDto,
  ClonarPlanoLoteDto,
  PlanoManutencaoResponseDto,
  PlanoResumoDto,
  DashboardPlanosDto,
  ClonarPlanoLoteResponseDto
} from './dto';
import { PlanosManutencaoCrudService } from './services/planos-manutencao-crud.service';
import { PlanosManutencaoQueryService } from './services/planos-manutencao-query.service';
import { PlanosManutencaoDuplicacaoService } from './services/planos-manutencao-duplicacao.service';
import { PlanosManutencaoEstatisticasService } from './services/planos-manutencao-estatisticas.service';

/**
 * Service principal que atua como Facade para os services especializados
 * Mantém a mesma interface pública, mas delega para services específicos
 */
@Injectable()
export class PlanosManutencaoService {
  constructor(
    private readonly crudService: PlanosManutencaoCrudService,
    private readonly queryService: PlanosManutencaoQueryService,
    private readonly duplicacaoService: PlanosManutencaoDuplicacaoService,
    private readonly estatisticasService: PlanosManutencaoEstatisticasService
  ) {}

  // ============================================================================
  // CRUD BÁSICO - Delegado para CrudService
  // ============================================================================

  async criar(createDto: CreatePlanoManutencaoDto): Promise<PlanoManutencaoResponseDto> {
    return this.crudService.criar(createDto);
  }

  async buscarPorId(id: string, incluirTarefas = false): Promise<PlanoManutencaoResponseDto> {
    return this.crudService.buscarPorId(id, incluirTarefas);
  }

  async atualizar(id: string, updateDto: UpdatePlanoManutencaoDto): Promise<PlanoManutencaoResponseDto> {
    return this.crudService.atualizar(id, updateDto);
  }

  async atualizarStatus(
    id: string,
    updateStatusDto: UpdateStatusPlanoDto
  ): Promise<PlanoManutencaoResponseDto> {
    return this.crudService.atualizarStatus(id, updateStatusDto);
  }

  async remover(id: string): Promise<void> {
    return this.crudService.remover(id);
  }

  // ============================================================================
  // QUERIES - Delegado para QueryService
  // ============================================================================

  async listar(queryDto: QueryPlanosDto): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.queryService.listar(queryDto);
  }

  async buscarPorEquipamento(equipamentoId: string): Promise<PlanoManutencaoResponseDto> {
    return this.queryService.buscarPorEquipamento(equipamentoId);
  }

  async buscarPorPlanta(
    plantaId: string,
    queryDto: QueryPlanosPorPlantaDto
  ): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.queryService.buscarPorPlanta(plantaId, queryDto);
  }

  async buscarPorUnidade(
    unidadeId: string,
    queryDto: QueryPlanosPorPlantaDto
  ): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.queryService.buscarPorUnidade(unidadeId, queryDto);
  }

  // ============================================================================
  // DUPLICAÇÃO - Delegado para DuplicacaoService
  // ============================================================================

  async duplicar(id: string, duplicarDto: DuplicarPlanoDto): Promise<PlanoManutencaoResponseDto> {
    return this.duplicacaoService.duplicar(id, duplicarDto);
  }

  async clonarParaVariosEquipamentos(
    planoOrigemId: string,
    dto: ClonarPlanoLoteDto
  ): Promise<ClonarPlanoLoteResponseDto> {
    return this.duplicacaoService.clonarParaVariosEquipamentos(planoOrigemId, dto);
  }

  // ============================================================================
  // ESTATÍSTICAS - Delegado para EstatisticasService
  // ============================================================================

  async obterResumo(id: string): Promise<PlanoResumoDto> {
    return this.estatisticasService.obterResumo(id);
  }

  async obterDashboard(): Promise<DashboardPlanosDto> {
    return this.estatisticasService.obterDashboard();
  }
}
