import { SetMetadata } from '@nestjs/common';
import type { ScopedEntityType } from '../permission-scope.service';

export const PLANTA_SCOPE_KEY = 'planta_scope';

export interface PlantaScopeMetadata {
  /** Tipo da entidade a validar contra planta_operadores / proprietario_id */
  entity: ScopedEntityType;
  /** Onde achar o id da entidade no request (default: param) */
  from?: 'param' | 'body' | 'query';
  /** Nome do campo/param onde o id esta (default: 'id'). Lista de ids: confere cada um */
  name?: string;
  /** Campo do corpo que pode faltar (o pai OU a unidade do equipamento): ausente, nao confere */
  opcional?: boolean;
  /** O "nao encontrado" que a rota ja da para o id que nao existe (SN-57: a mesma mensagem) */
  naoEncontrado?: string;
}

/**
 * Marca um handler para validar que as entidades alvo estao no escopo do usuario
 * logado. O `PlantaScopeGuard` (APP_GUARD, depois do PermissionsGuard) le esse
 * metadado e chama `PermissionScopeService.assertEntityInScope` antes do handler
 * — e antes dos interceptors: o upload de quem esta fora nem chega ao disco.
 *
 * Fora do escopo = 404 com a mesma mensagem do que nao existe (SN-57).
 *
 * Uso:
 *   @Patch(':id')
 *   @UsePlantaScope({ entity: 'equipamento' })            // le params.id
 *
 *   @Post(':id/instalar')                                  // a posicao e o equipamento
 *   @UsePlantaScope({ entity: 'ativo_funcional' }, { entity: 'equipamento', from: 'body', name: 'equipamento_id' })
 *
 *   @Post()                                                // o pai OU a unidade
 *   @UsePlantaScope(
 *     { entity: 'unidade', from: 'body', name: 'unidade_id', opcional: true },
 *     { entity: 'equipamento', from: 'body', name: 'equipamento_pai_id', opcional: true },
 *   )
 *
 * Ficou sem efeito ate o SN-75 (out/2026): o guard nunca foi registrado, e
 * nenhuma rota usava o decorator. `escopo-das-escritas.spec.ts` cobre as rotas.
 */
export const UsePlantaScope = (...metas: PlantaScopeMetadata[]) => SetMetadata(PLANTA_SCOPE_KEY, metas);

export const SO_SEM_ESCOPO_KEY = 'so_sem_escopo';

/**
 * A escrita é só de quem não tem escopo por planta (a Aupus): o cliente e o
 * técnico levam 403 com a mensagem, mesmo com a permissão. Para o que não é de
 * uma planta só — a agenda (feriados e dias úteis, decisão do usuário,
 * 19/out/2026, SN-76). Lido pelo mesmo `PlantaScopeGuard`.
 */
export const SoSemEscopo = (mensagem: string) => SetMetadata(SO_SEM_ESCOPO_KEY, mensagem);
