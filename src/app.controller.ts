// src/app.controller.ts - TESTE DE CONEXÃO COM BANCO
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Sistema')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Verificar status da API' })
  @ApiResponse({ status: 200, description: 'API funcionando' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check da API e banco' })
  @ApiResponse({ 
    status: 200, 
    description: 'Status da API e conexões',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2024-01-01T00:00:00.000Z',
        database: 'connected',
        version: '1.0.0'
      }
    }
  })
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('test-db')
  @ApiOperation({ summary: 'Testar conexão com banco de dados' })
  @ApiResponse({ 
    status: 200, 
    description: 'Teste de conexão com banco',
    schema: {
      example: {
        database: 'connected',
        totalUsuarios: 42,
        timestamp: '2024-01-01T00:00:00.000Z'
      }
    }
  })
  testDatabase() {
    return this.appService.testDatabase();
  }
}