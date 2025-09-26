import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PermissionResponseDto } from './dto';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<PermissionResponseDto[]> {
    const permissions = await this.prisma.permissions.findMany({
      orderBy: {
        name: 'asc'
      }
    });

    return permissions.map(permission => ({
      id: Number(permission.id),
      name: permission.name,
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
      guard_name: permission.guard_name,
      created_at: permission.created_at,
      updated_at: permission.updated_at
    };
  }

  async findGrouped(): Promise<{ [category: string]: PermissionResponseDto[] }> {
    const permissions = await this.findAll();
    
    // Group permissions by category based on the permission names
    const grouped: { [category: string]: PermissionResponseDto[] } = {};
    
    // Define categories based on your frontend structure
    const categories = {
      'Dashboard': ['Dashboard'],
      'Monitoramento': ['MonitoramentoConsumo', 'MonitoramentoClientes'],
      'Gestão de Energia': ['GeracaoEnergia', 'MinhasUsinas', 'Equipamentos', 'Plantas'],
      'Comercial': ['GestaoOportunidades', 'Oportunidades', 'Prospeccao', 'ProspeccaoListagem'],
      'Financeiro': ['Financeiro'],
      'Clube': ['ClubeAupus', 'AreaDoProprietario', 'AreaDoAssociado'],
      'Gestão': ['Usuarios', 'Organizacoes', 'Associados', 'Proprietarios'],
      'Unidades': ['UnidadesConsumidoras'],
      'Sistema': ['Configuracoes', 'Documentos']
    };

    // Initialize categories
    Object.keys(categories).forEach(category => {
      grouped[category] = [];
    });

    // Group permissions
    permissions.forEach(permission => {
      let found = false;
      for (const [category, permissionNames] of Object.entries(categories)) {
        if (permissionNames.includes(permission.name)) {
          grouped[category].push(permission);
          found = true;
          break;
        }
      }
      
      // If not found in any category, add to "Outros"
      if (!found) {
        if (!grouped['Outros']) {
          grouped['Outros'] = [];
        }
        grouped['Outros'].push(permission);
      }
    });

    // Remove empty categories
    Object.keys(grouped).forEach(category => {
      if (grouped[category].length === 0) {
        delete grouped[category];
      }
    });

    return grouped;
  }
}