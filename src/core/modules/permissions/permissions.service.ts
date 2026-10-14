import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionResponseDto } from './dto';
import { PERMISSOES } from './matriz-de-permissoes';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Retorna todas as permissões MODERNAS (padrão recurso.acao)
   * Filtra automaticamente permissões legadas (sem ponto)
   */
  async findAll(): Promise<PermissionResponseDto[]> {
    const permissions = await this.prisma.permissions.findMany({
      where: {
        name: {
          contains: '.' // Apenas permissões modernas (recurso.acao)
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    return permissions.map(permission => ({
      id: Number(permission.id),
      name: permission.name,
      display_name: permission.display_name || permission.name,
      description: permission.description || '',
      guard_name: permission.guard_name,
      created_at: permission.created_at,
      updated_at: permission.updated_at
    }));
  }

  async findOne(id: number): Promise<PermissionResponseDto | null> {
    const permission = await this.prisma.permissions.findUnique({
      where: { id: BigInt(id) }
    });

    if (!permission) {
      return null;
    }

    return {
      id: Number(permission.id),
      name: permission.name,
      display_name: permission.display_name || permission.name,
      description: permission.description || '',
      guard_name: permission.guard_name,
      created_at: permission.created_at,
      updated_at: permission.updated_at
    };
  }

  /**
   * As permissões da tela de usuário, agrupadas pela categoria da matriz
   * (matriz-de-permissoes.ts), com o nome exibido e a descrição dela, na ordem
   * dela. Uma vez por nome (a mesma permissão pode existir em dois guards; vale
   * a de menor id, a mesma que o seed usa). A que saiu da matriz não aparece:
   * marcá-la não daria acesso a nada.
   */
  async findGrouped(): Promise<{ [category: string]: PermissionResponseDto[] }> {
    const doBanco = [...(await this.findAll())].sort((x, y) => x.id - y.id);
    const grupos: { [category: string]: PermissionResponseDto[] } = {};
    for (const def of PERMISSOES) {
      const permissao = doBanco.find((p) => p.name === def.name);
      if (!permissao) continue;
      (grupos[def.category] ??= []).push({ ...permissao, display_name: def.display_name, description: def.description });
    }
    return grupos;
  }
}
