import { Module, Global } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { MqttDiagnosticsService } from './mqtt-diagnostics.service';
import { MqttDiagnosticsController } from './mqtt-diagnostics.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EquipamentosDadosModule } from '../../modules/equipamentos-dados/equipamentos-dados.module';

@Global()
@Module({
  imports: [
    PrismaModule,
    EquipamentosDadosModule, // ✅ Import para usar MqttIngestionService
  ],
  controllers: [MqttDiagnosticsController],
  providers: [MqttService, MqttDiagnosticsService],
  exports: [MqttService, MqttDiagnosticsService],
})
export class MqttModule {}
