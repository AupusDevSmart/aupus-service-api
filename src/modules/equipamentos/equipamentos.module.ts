import { Module } from '@nestjs/common';
import { EquipamentosService } from './equipamentos.service';
import { EquipamentosDataService } from './services/equipamentos-data.service';
import { EquipamentosController } from './equipamentos.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { MqttModule } from '../../shared/mqtt/mqtt.module';

@Module({
  imports: [
    PrismaModule, 
    //MqttModule
  ],
  controllers: [EquipamentosController],
  providers: [EquipamentosService, EquipamentosDataService],
  exports: [EquipamentosService, EquipamentosDataService],
})
export class EquipamentosModule {}
