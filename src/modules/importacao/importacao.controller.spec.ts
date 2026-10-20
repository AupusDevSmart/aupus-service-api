import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '@/core/modules/auth/guards/permissions.guard';
import { ImportacaoController } from './importacao.controller';

/**
 * Sem permissão, 403: cada rota de importação passa pelo PermissionsGuard
 * global com as MESMAS permissões das rotas de criar e editar do cadastro. O
 * guard que nega devolve false, e o Nest responde 403.
 *
 * O que se prova aqui é a ligação rota → permissão: trocar uma permissão sem
 * querer abriria a planilha como porta dos fundos.
 */
describe('ImportacaoController — permissões', () => {
  const guard = new PermissionsGuard(new Reflector());

  const contexto = (handler: string, permissions: string[]) =>
    ({
      getHandler: () => (ImportacaoController.prototype as unknown as Record<string, () => unknown>)[handler],
      getClass: () => ImportacaoController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', permissions } }) }),
    }) as unknown as ExecutionContext;

  const rotas: Array<[string, string[]]> = [
    ['importarRecursos', ['recursos.manage', 'manutencao.manage']],
    ['importarMaquinarios', ['recursos.manage', 'manutencao.manage']],
    ['importarVeiculos', ['recursos.manage']],
    ['importarFeriados', ['agenda.manage']],
    ['importarConcessionarias', ['equipamentos.manage']],
    [
      'importarUsuarios',
      ['usuarios.manage', 'usuarios.create_operador', 'usuarios.create_proprietario', 'usuarios.create_analista', 'usuarios.create_admin'],
    ],
    ['importarInstrucoes', ['manutencao.manage']],
    ['importarPlanos', ['manutencao.manage']],
    ['importarPlantas', ['plantas.manage']],
    ['importarEquipamentos', ['equipamentos.manage']],
  ];

  it('toda rota do controller está nesta lista (rota nova sem teste de permissão falha aqui)', () => {
    const handlers = Object.getOwnPropertyNames(ImportacaoController.prototype).filter((n) => n.startsWith('importar'));
    expect(handlers.sort()).toEqual(rotas.map(([h]) => h).sort());
  });

  it.each(rotas)('%s: sem a permissão é negado (403); com uma das permitidas, passa', (handler, permitidas) => {
    expect(guard.canActivate(contexto(handler, ['dashboard.view']))).toBe(false);
    expect(guard.canActivate(contexto(handler, []))).toBe(false);
    for (const permissao of permitidas) {
      expect(guard.canActivate(contexto(handler, [permissao]))).toBe(true);
    }
  });
});
