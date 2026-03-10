import { Module, Global } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { MqttDiagnosticsService } from './mqtt-diagnostics.service';
import { MqttDiagnosticsController } from './mqtt-diagnostics.controller';
import { MqttRedisBufferService } from './mqtt-redis-buffer.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EquipamentosDadosModule } from '../../modules/equipamentos-dados/equipamentos-dados.module';

@Global()
@Module({
  imports: [
    PrismaModule,
    EquipamentosDadosModule, // ✅ Import para usar MqttIngestionService
  ],
  controllers: [MqttDiagnosticsController],
  providers: [
    MqttService,
    MqttDiagnosticsService,
    MqttRedisBufferService, // ✅ Serviço de buffer Redis
  ],
  exports: [
    MqttService,
    MqttDiagnosticsService,
    MqttRedisBufferService, // ✅ Exportar para uso em outros módulos
  ],
})
export class MqttModule {}
