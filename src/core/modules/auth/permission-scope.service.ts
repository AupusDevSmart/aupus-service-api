import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { plantaDasTarefas, plantaDeCadaEquipamento } from './planta-dos-equipamentos';

export type PlantaScope = string[] | null;

/**
 * Usuario "leve" suficiente para resolver scope. JWT payload normalmente tras id e role.
 */
export interface ScopedUser {
  id?: string;
  role?: string | null;
}

/**
 * Entidades cujos vinculos a planta sao resolviveis por uma consulta padrao.
 * Use em `assertEntityInScope(type, id, user)` quando o controller recebe o id
 * de uma entidade dependente e nao tem o `planta_id` em maos.
 */
export type ScopedEntityType =
  | 'planta'
  | 'unidade'
  | 'ativo_funcional'
  | 'equipamento'
  | 'anomalia'
  | 'tarefa'
  | 'ordem_servico'
  | 'solicitacao_servico'
  | 'programacao_os'
  | 'regra_log_mqtt'
  | 'log_mqtt';

/**
 * Resolve o conjunto de plantas que um usuario pode acessar, com base no seu role,
 * e fornece helpers para aplicar/validar o escopo em queries e endpoints.
 *
 * Convencao do escopo:
 * - `null`     -> SEM filtro (admin/gerente/analista/super_admin vem tudo)
 * - `string[]` -> lista de planta_ids permitidos (array vazio = nao ve nada)
 *
 * Mapeamento por role:
 * - operador     -> plantas vinculadas via planta_operadores
 * - proprietario -> plantas onde plantas.proprietario_id = userId
 * - demais       -> null (sem filtro)
 *
 * Convencao de resposta a recurso fora do escopo: ForbiddenException (consistente
 * em todos os modulos; ver docs/RBAC-SCOPE.md).
 */
@Injectable()
export class PermissionScopeService {
  constructor(private prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Resolucao do scope
  // -------------------------------------------------------------------------

  async getPlantasDoUsuario(userId: string, roleName?: string | null): Promise<PlantaScope> {
    const id = userId?.trim();
    if (!id) return null;

    if (roleName === 'operador') {
      const rows = await this.prisma.planta_operadores.findMany({
        where: { usuario_id: id },
        select: { planta_id: true },
      });
      return rows.map((r) => r.planta_id.trim());
    }

    if (roleName === 'proprietario') {
      const rows = await this.prisma.plantas.findMany({
        where: { proprietario_id: id, deleted_at: null },
        select: { id: true },
      });
      return rows.map((r) => r.id.trim());
    }

    return null;
  }

  /**
   * Conveniencia: resolve o scope direto a partir do objeto de usuario do request.
   */
  async getScope(user?: ScopedUser | null): Promise<PlantaScope> {
    if (!user?.id) return null;
    return this.getPlantasDoUsuario(user.id, user.role ?? null);
  }

  isScoped(scope: PlantaScope): scope is string[] {
    return Array.isArray(scope);
  }

  // -------------------------------------------------------------------------
  // Aplicacao em filtros Prisma
  // -------------------------------------------------------------------------

  /**
   * Aplica o filtro de planta no objeto `where` do Prisma quando o escopo eh ativo.
   *
   * `path` aceita:
   * - 'planta_id'                              (entidade tem coluna direta)
   * - 'unidade.planta_id'                      (atravessa 1 relacao)
   * - 'equipamento.unidade.planta_id'          (atravessa 2 relacoes)
   *
   * O where eh mutado E retornado para encadeamento.
   *
   * Exemplos:
   *   applyPlantaFilter({}, scope, 'planta_id')
   *     -> { planta_id: { in: scope } }
   *
   *   applyPlantaFilter({}, scope, 'unidade.planta_id')
   *     -> { unidade: { planta_id: { in: scope } } }
   *
   *   applyPlantaFilter({}, scope, 'equipamento.unidade.planta_id')
   *     -> { equipamento: { unidade: { planta_id: { in: scope } } } }
   */
  applyPlantaFilter<T extends Record<string, unknown>>(
    where: T,
    scope: PlantaScope,
    path: string = 'planta_id',
  ): T {
    if (!this.isScoped(scope)) return where;

    const parts = path.split('.').filter(Boolean);
    if (parts.length === 0) return where;

    // O caminho so se conhece em runtime: a escrita e pelo tipo largo do where
    const alvo: Record<string, unknown> = where;
    const leaf = { in: scope };
    if (parts.length === 1) {
      alvo[parts[0]] = leaf;
      return where;
    }

    // Constroi nested where reverso: equipamento -> { unidade: { planta_id: leaf } }
    let nested: Record<string, unknown> = leaf;
    for (let i = parts.length - 1; i >= 1; i--) {
      nested = { [parts[i]]: nested };
    }
    alvo[parts[0]] = nested;
    return where;
  }

  // -------------------------------------------------------------------------
  // Asserts de pertencimento ao escopo
  // -------------------------------------------------------------------------

  /**
   * Joga ForbiddenException se o `plantaId` nao esta no escopo do usuario.
   * Aceita scope null (admin) ou plantaId null/undefined (registro "global" -> proibido para escopados).
   */
  async assertPlantaInScope(plantaId: string | null | undefined, user: ScopedUser | undefined): Promise<void> {
    const scope = await this.getScope(user);
    if (!this.isScoped(scope)) return;

    const id = plantaId?.trim();
    if (!id) {
      throw new ForbiddenException('Recurso fora do escopo do usuario');
    }
    if (!scope.includes(id)) {
      throw new ForbiddenException('Recurso fora do escopo do usuario');
    }
  }

  /**
   * Variante para quando o caller ja resolveu o scope (evita 2a query).
   */
  assertPlantaInScopeSync(plantaId: string | null | undefined, scope: PlantaScope): void {
    if (!this.isScoped(scope)) return;
    const id = plantaId?.trim();
    if (!id || !scope.includes(id)) {
      throw new ForbiddenException('Recurso fora do escopo do usuario');
    }
  }

  /**
   * Resolve o planta_id de uma entidade dependente e valida que esta no escopo.
   * Util quando o controller so tem o id do equipamento/unidade/tarefa/etc.
   *
   * Lanca NotFoundException se a entidade nao existe (consistente com /:id GET).
   * Lanca ForbiddenException se existe mas esta fora do escopo.
   */
  async assertEntityInScope(
    type: ScopedEntityType,
    entityId: string,
    user: ScopedUser | undefined,
  ): Promise<void> {
    const scope = await this.getScope(user);
    if (!this.isScoped(scope)) return;

    const id = entityId?.trim();
    if (!id) throw new NotFoundException(`${type} nao encontrado`);

    const plantaId = await this.resolveEntityPlantaId(type, id);
    if (plantaId === null) throw new NotFoundException(`${type} nao encontrado`);
    this.assertPlantaInScopeSync(plantaId, scope);
  }

  /**
   * A planta de um equipamento pela regra única de `plantaDeCadaEquipamento`:
   * a dele, senão a da unidade, senão — componente (UAR), que não tem unidade —
   * a da unidade do UC pai. Antes cada caso abaixo parava na unidade, e o
   * componente (e a anomalia, a tarefa, a OS e a programação dele) dava "não
   * encontrado" para o técnico e o cliente (SN-40).
   */
  private async plantaDoEquipamento(equipamentoId: string | null | undefined): Promise<string | null> {
    const id = equipamentoId?.trim();
    if (!id) return null;
    return (await plantaDeCadaEquipamento(this.prisma, [id])).get(id) ?? null;
  }

  /**
   * Busca o planta_id "efetivo" de uma entidade do dominio.
   * Retorna null se a entidade nao existe (ou foi soft-deleted).
   */
  private async resolveEntityPlantaId(type: ScopedEntityType, id: string): Promise<string | null> {
    switch (type) {
      case 'planta': {
        const row = await this.prisma.plantas.findFirst({
          where: { id, deleted_at: null },
          select: { id: true },
        });
        return row?.id?.trim() ?? null;
      }
      case 'unidade': {
        const row = await this.prisma.unidades.findFirst({
          where: { id, deleted_at: null },
          select: { planta_id: true },
        });
        return row?.planta_id?.trim() ?? null;
      }
      case 'ativo_funcional': {
        // A posição é de uma unidade (coluna obrigatória); a planta é a dela.
        const row = await this.prisma.ativos_funcionais.findFirst({
          where: { id, deleted_at: null },
          select: { unidade_id: true },
        });
        if (!row) return null;
        const unidade = await this.prisma.unidades.findFirst({
          where: { id: row.unidade_id.trim(), deleted_at: null },
          select: { planta_id: true },
        });
        return unidade?.planta_id?.trim() ?? null;
      }
      case 'equipamento': {
        // equipamentos.planta_id é nullable: vale a regra de plantaDoEquipamento.
        const row = await this.prisma.equipamentos.findFirst({
          where: { id, deleted_at: null },
          select: { id: true },
        });
        if (!row) return null;
        return this.plantaDoEquipamento(row.id);
      }
      case 'anomalia': {
        // anomalias.planta_id é nullable; senão, a planta do equipamento.
        const row = await this.prisma.anomalias.findFirst({
          where: { id, deleted_at: null },
          select: { planta_id: true, equipamento_id: true },
        });
        if (!row) return null;
        return row.planta_id?.trim() || (await this.plantaDoEquipamento(row.equipamento_id));
      }
      case 'tarefa': {
        // tarefas.planta_id é nullable; senão, a planta do equipamento.
        const row = await this.prisma.tarefas.findFirst({
          where: { id, deleted_at: null },
          select: { planta_id: true, equipamento_id: true },
        });
        if (!row) return null;
        return row.planta_id?.trim() || (await this.plantaDoEquipamento(row.equipamento_id));
      }
      case 'ordem_servico': {
        // ordens_servico.planta_id é nullable; senão, a planta do equipamento.
        // A OS marca exclusao em deletado_em (nao deleted_at): com o nome errado o
        // Prisma recusava a consulta e toda acao do tecnico numa OS dava erro.
        const row = await this.prisma.ordens_servico.findFirst({
          where: { id, deletado_em: null },
          select: { planta_id: true, equipamento_id: true },
        });
        if (!row) return null;
        // OS de tarefa antiga, sem planta gravada (SN-33): vale a planta das tarefas
        return (
          row.planta_id?.trim() ||
          (await this.plantaDoEquipamento(row.equipamento_id)) ||
          (await plantaDasTarefas(this.prisma, { osId: id }))
        );
      }
      case 'solicitacao_servico': {
        // solicitacoes_servico.planta_id eh non-nullable; sem fallback necessario.
        const row = await this.prisma.solicitacoes_servico.findFirst({
          where: { id, deleted_at: null },
          select: { planta_id: true },
        });
        return row?.planta_id?.trim() ?? null;
      }
      case 'programacao_os': {
        // programacoes_os.planta_id é nullable; senão, a planta do equipamento.
        // Exclusao em deletado_em, como na OS.
        const row = await this.prisma.programacoes_os.findFirst({
          where: { id, deletado_em: null },
          select: { planta_id: true, equipamento_id: true },
        });
        if (!row) return null;
        return (
          row.planta_id?.trim() ||
          (await this.plantaDoEquipamento(row.equipamento_id)) ||
          (await plantaDasTarefas(this.prisma, { programacaoId: id }))
        );
      }
      case 'regra_log_mqtt': {
        // Resolvida pela planta do equipamento.
        const row = await this.prisma.regras_logs_mqtt.findFirst({
          where: { id },
          select: { equipamento_id: true },
        });
        return this.plantaDoEquipamento(row?.equipamento_id);
      }
      case 'log_mqtt': {
        // Resolvida pela planta do equipamento.
        const row = await this.prisma.logs_mqtt.findFirst({
          where: { id },
          select: { equipamento_id: true },
        });
        return this.plantaDoEquipamento(row?.equipamento_id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Ownership helpers (filtros 2-nivel: scope + criador/responsavel)
  // -------------------------------------------------------------------------

  /**
   * Verifica que `entityId` pertence ao usuario (coluna de ownership) E esta no scope.
   * Util para `anomalias.manage_own` (usuario_id) e `usuarios.manage_created` (created_by).
   *
   * `entityType` indica qual tabela; `ownerColumn` qual coluna FK ao usuarios.id.
   *
   * - Se a entidade nao existe -> NotFoundException
   * - Se existe mas o owner nao bate -> ForbiddenException
   * - Tambem aplica scope de planta quando o tipo tem planta_id
   */
  async assertOwnership(
    type: 'anomalia' | 'usuario',
    entityId: string,
    user: ScopedUser | undefined,
  ): Promise<void> {
    const userId = user?.id?.trim();
    if (!userId) throw new ForbiddenException('Usuario nao autenticado');

    const id = entityId?.trim();
    if (!id) throw new NotFoundException(`${type} nao encontrado`);

    if (type === 'anomalia') {
      const row = await this.prisma.anomalias.findFirst({
        where: { id, deleted_at: null },
        select: { usuario_id: true, planta_id: true },
      });
      if (!row) throw new NotFoundException('anomalia nao encontrada');
      if (row.usuario_id?.trim() !== userId) {
        throw new ForbiddenException('Voce so pode editar anomalias que reportou');
      }
      // Scope adicional por planta (anomalias.manage_own ainda respeita o scope)
      await this.assertPlantaInScope(row.planta_id, user);
      return;
    }

    if (type === 'usuario') {
      const row = await this.prisma.usuarios.findFirst({
        where: { id, deleted_at: null },
        select: { created_by: true },
      });
      if (!row) throw new NotFoundException('usuario nao encontrado');
      if (row.created_by?.trim() !== userId) {
        throw new ForbiddenException('Voce so pode editar usuarios que criou');
      }
      return;
    }
  }
}
