// src/app.module.ts - ATUALIZADO COM USUARIOS MODULE E AUTH MODULE
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './shared/prisma/prisma.module';
import { MqttModule } from './shared/mqtt/mqtt.module';
import { WebSocketModule } from './websocket/websocket.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PlantasModule } from './modules/plantas/plantas.module';
import { UnidadesModule } from './modules/unidades/unidades.module';
import { EquipamentosModule } from './modules/equipamentos/equipamentos.module';
import { AnomaliasModule } from './modules/anomalias/anomalias.module';
import { PlanosManutencaoModule } from './modules/planos-manutencao/planos-manutencao.module';
import { TarefasModule } from './modules/tarefas/tarefas.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { VeiculosModule } from './modules/veiculos/veiculos.module';
import { ReservasModule } from './modules/reservas/reservas.module';
import { ProgramacaoOSModule } from './modules/programacao-os/programacao-os.module';
import { ExecucaoOSModule } from './modules/execucao-os/execucao-os.module';
import { DiagramasModule } from './modules/diagramas/diagramas.module';
import { TiposEquipamentosModule } from './modules/tipos-equipamentos/tipos-equipamentos.module';
import { ConcessionariasModule } from './modules/concessionarias/concessionarias.module';
import { EquipamentosDadosModule } from './modules/equipamentos-dados/equipamentos-dados.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ConfiguracaoDemandaModule } from './modules/configuracao-demanda/configuracao-demanda.module';
import { CoaModule } from './modules/coa/coa.module';

@Module({
  imports: [
    // ✅ Configuração global
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // ✅ Cron Jobs e Tarefas Agendadas
    ScheduleModule.forRoot(),

    // ✅ Database
    PrismaModule,

    // ✅ MQTT e WebSocket para dados em tempo real
    MqttModule,
    WebSocketModule,

    // ✅ Health Check e Monitoramento
    HealthModule,

    // ✅ Autenticação
    AuthModule,

    // ✅ Módulos de negócio
    UsuariosModule,
    RolesModule,
    PermissionsModule,
    PlantasModule,
    UnidadesModule,
    EquipamentosModule,
    DiagramasModule,
    TiposEquipamentosModule,
    AnomaliasModule,
    PlanosManutencaoModule,
    TarefasModule,
    AgendaModule,
    VeiculosModule,
    ReservasModule,
    ProgramacaoOSModule,
    ExecucaoOSModule,
    ConcessionariasModule,
    EquipamentosDadosModule,
    ConfiguracaoDemandaModule,
    CoaModule, // Centro de Operações Avançadas
    UploadsModule, // Módulo para servir arquivos de upload
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}