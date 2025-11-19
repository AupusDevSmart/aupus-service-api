import { Module, Global } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EquipamentosDadosModule } from '../../modules/equipamentos-dados/equipamentos-dados.module';

@Global()
@Module({
  imports: [
    PrismaModule,
    EquipamentosDadosModule, // ✅ Import para usar MqttIngestionService
  ],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
