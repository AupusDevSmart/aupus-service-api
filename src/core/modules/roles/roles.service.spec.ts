import { RolesService } from './roles.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('RolesService', () => {
  const papel = (id: number, name: string) => ({ id: BigInt(id), name, guard_name: 'api', created_at: null, updated_at: null, role_has_permissions: [] });
  const prisma = { roles: { findMany: jest.fn(), findUnique: jest.fn() } };
  const service = new RolesService(prisma as unknown as PrismaService);

  it('a lista traz como a tela mostra cada papel da matriz (nome, descrição, escopo, ordem)', async () => {
    prisma.roles.findMany.mockResolvedValue([papel(10, 'operador'), papel(7, 'gerente'), papel(99, 'vendedor')]);

    const [operador, gerente, legado] = await service.findAll();

    expect(operador).toMatchObject({ name: 'operador', nome_exibido: 'Técnico de campo', ordem: 0 });
    expect(operador.escopo).toMatch(/vinculado/);
    expect(gerente).toMatchObject({ nome_exibido: 'Gerente de manutenção', ordem: 3 });
    // Papel legado (fora da matriz) segue na lista, só sem os textos
    expect(legado.nome_exibido).toBeUndefined();
  });

  it('o papel sozinho também', async () => {
    prisma.roles.findUnique.mockResolvedValue(papel(6, 'proprietario'));
    expect(await service.findOne(6)).toMatchObject({ nome_exibido: 'Cliente' });
  });
});
