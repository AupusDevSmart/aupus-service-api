// src/shared/prisma/prisma.service.ts - CORRIGIDO
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('🔗 Conectado ao banco PostgreSQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('❌ Desconectado do banco PostgreSQL');
  }
}