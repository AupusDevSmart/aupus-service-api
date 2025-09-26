// src/app.service.ts - CORRIGIDO
import { Injectable } from '@nestjs/common';
import { PrismaService } from './shared/prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'API de Manutenção Industrial funcionando! 🚀';
  }

  async getHealth() {
    try {
      // Testar conexão simples com banco
      await this.prisma.$queryRaw`SELECT 1`;
      
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
        version: '1.0.0',
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async testDatabase() {
    try {
      // ✅ USAR NOMES CORRETOS DO BANCO
      const totalUsuarios = await this.prisma.usuarios.count({
        where: {
          deleted_at: null,
        },
      });

      const usuariosAtivos = await this.prisma.usuarios.count({
        where: {
          deleted_at: null,
          is_active: true,
        },
      });

      return {
        database: 'connected',
        timestamp: new Date().toISOString(),
        statistics: {
          totalUsuarios,
          usuariosAtivos,
          usuariosInativos: totalUsuarios - usuariosAtivos,
        },
        tables: {
          usuarios: '✅ Conectado',
          sessions: '✅ Disponível',
        },
      };
    } catch (error) {
      console.error('Erro ao testar banco:', error);
      
      return {
        database: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestion: 'Verifique se o banco está rodando e as credenciais estão corretas',
      };
    }
  }
}