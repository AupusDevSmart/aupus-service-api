import { PermissionsService } from './permissions.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('PermissionsService.findGrouped', () => {
  const linha = (id: number, name: string, guard = 'web') => ({ id: BigInt(id), name, guard_name: guard, display_name: null, description: null, created_at: null, updated_at: null });
  const prisma = { permissions: { findMany: jest.fn() } };
  const service = new PermissionsService(prisma as unknown as PrismaService);

  it('agrupa pela categoria da matriz, com o nome e a descrição dela, na ordem dela', async () => {
    prisma.permissions.findMany.mockResolvedValue([linha(2, 'usuarios.view'), linha(1, 'dashboard.view'), linha(3, 'execucao_os.executar')]);

    const grupos = await service.findGrouped();

    expect(Object.keys(grupos)).toEqual(['Painel', 'Ordens de serviço', 'Usuários']);
    expect(grupos['Ordens de serviço'][0]).toMatchObject({ name: 'execucao_os.executar', display_name: 'Executar OS' });
    expect(grupos['Ordens de serviço'][0].description).toMatch(/checklist/);
  });

  it('a mesma permissão em dois guards aparece uma vez; a que saiu da matriz não aparece', async () => {
    prisma.permissions.findMany.mockResolvedValue([
      linha(1, 'dashboard.view'),
      linha(9, 'dashboard.view', 'api'),
      linha(5, 'tarefas.update_status'),
      linha(6, 'equipamentos.manage_bos'),
    ]);

    const grupos = await service.findGrouped();

    expect(grupos).toEqual({ Painel: [expect.objectContaining({ id: 1, name: 'dashboard.view' })] });
  });
});
