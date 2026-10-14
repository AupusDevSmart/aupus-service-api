/**
 * A matriz de permissões mora em src/core/modules/permissions/matriz-de-permissoes.ts
 * (fonte única: a API e os testes leem de lá). Este arquivo só repassa com os
 * nomes antigos para os scripts de seed.
 */
import { PAPEIS, PERMISSOES, type PermissaoDef } from '../../src/core/modules/permissions/matriz-de-permissoes';

export type PermissionDef = PermissaoDef;

export const PERMISSIONS: PermissionDef[] = PERMISSOES;

export const ROLE_PERMISSIONS: Record<string, string[]> = Object.fromEntries(PAPEIS.map((p) => [p.name, p.permissoes]));

export const ROLES = PAPEIS.map((p) => p.name);
