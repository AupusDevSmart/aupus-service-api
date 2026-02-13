import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MqttDiagnosticsService } from './mqtt-diagnostics.service';

@ApiTags('MQTT Diagnostics')
@Controller('mqtt/diagnostico')
export class MqttDiagnosticsController {
  constructor(private readonly diagnosticsService: MqttDiagnosticsService) {}

  @Get()
  @ApiOperation({ summary: 'Diagnóstico completo do sistema MQTT' })
  @ApiResponse({ status: 200, description: 'Relatório de diagnóstico' })
  async getDiagnostics() {
    return this.diagnosticsService.getFullDiagnostics();
  }

  @Get('status')
  @ApiOperation({ summary: 'Status resumido do MQTT' })
  @ApiResponse({ status: 200, description: 'Status do sistema' })
  async getStatus() {
    return this.diagnosticsService.getStatus();
  }

  @Get('equipamentos')
  @ApiOperation({ summary: 'Lista de equipamentos e última recepção' })
  @ApiResponse({ status: 200, description: 'Lista de equipamentos MQTT' })
  async getEquipamentos() {
    return this.diagnosticsService.getEquipamentosStatus();
  }

  @Get('topicos')
  @ApiOperation({ summary: 'Lista de tópicos MQTT configurados' })
  @ApiResponse({ status: 200, description: 'Lista de tópicos' })
  async getTopicos() {
    return this.diagnosticsService.getTopicosStatus();
  }

  @Get('qualidade')
  @ApiOperation({ summary: 'Análise de qualidade dos dados' })
  @ApiResponse({ status: 200, description: 'Análise de qualidade' })
  async getQualidade() {
    return this.diagnosticsService.getQualidadeAnalise();
  }
}
