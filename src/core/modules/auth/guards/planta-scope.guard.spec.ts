import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlantaScopeGuard } from './planta-scope.guard';
import { UsePlantaScope } from '../decorators/planta-scope.decorator';
import { Public } from '../decorators/public.decorator';
import type { PermissionScopeService } from '../permission-scope.service';

/** O guard do `@UsePlantaScope` (SN-75): o que ele lê do request e o que confere. */
describe('PlantaScopeGuard', () => {
  class Rotas {
    @UsePlantaScope({ entity: 'equipamento' })
    porId() {}

    @UsePlantaScope(
      { entity: 'unidade', from: 'body', name: 'unidade_id', opcional: true },
      { entity: 'equipamento', from: 'body', name: 'equipamento_pai_id', opcional: true, naoEncontrado: 'Pai não encontrado' },
    )
    doCorpo() {}

    @UsePlantaScope({ entity: 'equipamento', from: 'body', name: 'destinos' })
    lista() {}

    @Public()
    @UsePlantaScope({ entity: 'equipamento' })
    publica() {}

    semEscopo() {}
  }

  const assert = jest.fn();
  const getScope = jest.fn();
  const guard = new PlantaScopeGuard(new Reflector(), {
    assertEntityInScope: assert,
    getScope,
    isScoped: (escopo: unknown) => Array.isArray(escopo),
  } as unknown as PermissionScopeService);
  const user = { id: 'u1', role: 'proprietario' };
  const rodar = (handler: () => void, req: Record<string, unknown>) =>
    guard.canActivate({
      getHandler: () => handler,
      getClass: () => Rotas,
      switchToHttp: () => ({ getRequest: () => ({ user, params: {}, body: {}, query: {}, ...req }) }),
    } as unknown as ExecutionContext);

  beforeEach(() => {
    assert.mockReset().mockResolvedValue(undefined);
    getScope.mockReset().mockResolvedValue(['planta-do-cliente']);
  });

  it('quem não tem escopo (admin, gerente, analista) passa sem conferir id nenhum', async () => {
    getScope.mockResolvedValue(null);
    await expect(rodar(Rotas.prototype.porId, { params: { id: 'e1' } })).resolves.toBe(true);
    expect(assert).not.toHaveBeenCalled();
  });

  it('confere o id do parâmetro', async () => {
    await expect(rodar(Rotas.prototype.porId, { params: { id: 'e1' } })).resolves.toBe(true);
    expect(assert).toHaveBeenCalledWith('equipamento', 'e1', user, undefined);
  });

  it('vários campos do corpo; o opcional ausente não é conferido; a mensagem da rota vai junto', async () => {
    await rodar(Rotas.prototype.doCorpo, { body: { equipamento_pai_id: 'pai1', unidade_id: '' } });
    expect(assert.mock.calls).toEqual([['equipamento', 'pai1', user, 'Pai não encontrado']]);
  });

  it('lista de ids: confere cada um', async () => {
    await rodar(Rotas.prototype.lista, { body: { destinos: ['a', 'b'] } });
    expect(assert.mock.calls.map((c) => c[1])).toEqual(['a', 'b']);
  });

  // Roda antes do ValidationPipe: o valor vem cru
  it('valor que não é texto vai como vazio (o "não encontrado" do assert)', async () => {
    await rodar(Rotas.prototype.porId, { params: {}, body: {} });
    await rodar(Rotas.prototype.lista, { body: { destinos: [{ id: 'x' }] } });
    expect(assert.mock.calls.map((c) => c[1])).toEqual(['', '']);
  });

  it('fora do escopo: o 404 do assert sobe', async () => {
    assert.mockRejectedValue(new NotFoundException('Equipamento não encontrado'));
    await expect(rodar(Rotas.prototype.porId, { params: { id: 'e1' } })).rejects.toThrow('Equipamento não encontrado');
  });

  it('rota pública e rota sem o decorator passam sem conferir', async () => {
    await expect(rodar(Rotas.prototype.publica, { params: { id: 'e1' } })).resolves.toBe(true);
    await expect(rodar(Rotas.prototype.semEscopo, {})).resolves.toBe(true);
    expect(assert).not.toHaveBeenCalled();
  });
});
