// aupus-service-api - modulo raiz
// Importa modulos compartilhados de @aupus/api-shared + modulos especificos do Service
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryModule } from '@sentry/nestjs/setup';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { APP_FILTER } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MqttModule } from './shared/mqtt/mqtt.module';
import { WebSocketModule } from './websocket/websocket.module';

// Modulos Service-only
import { HealthModule } from './modules/health/health.module';
import { AnomaliasModule } from './modules/anomalias/anomalias.module';
import { PlanosManutencaoModule } from './modules/planos-manutencao/planos-manutencao.module';
import { TarefasModule } from './modules/tarefas/tarefas.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { VeiculosModule } from './modules/veiculos/veiculos.module';
import { ReservasModule } from './modules/reservas/reservas.module';
import { ProgramacaoOSModule } from './modules/programacao-os/programacao-os.module';
import { ExecucaoOSModule } from './modules/execucao-os/execucao-os.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SolicitacoesServicoModule } from './modules/solicitacoes-servico/solicitacoes-servico.module';
import { InstrucoesModule } from './modules/instrucoes/instrucoes.module';
// Modulos MQTT-dependentes (mantidos por dependencia do MQTT infrastructure)
import { EquipamentosDadosModule } from './modules/equipamentos-dados/equipamentos-dados.module';
import { RegrasLogsMqttModule } from './modules/regras-logs-mqtt/regras-logs-mqtt.module';
import { LogsMqttModule } from './modules/logs-mqtt/logs-mqtt.module';

// Modulos compartilhados (de @aupus/api-shared)
import {
  PrismaModule,
  MailModule,
  AuthModule,
  UsuariosModule,
  RolesModule,
  PermissionsModule,
  PlantasModule,
  UnidadesModule,
  EquipamentosModule,
  TiposEquipamentosModule,
  CategoriasEquipamentosModule,
  ConcessionariasModule,
} from '@aupus/api-shared';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),

    PrismaModule,
    MailModule,
    MqttModule,
    WebSocketModule,

    HealthModule,
    AuthModule,

    // Compartilhados
    UsuariosModule,
    RolesModule,
    PermissionsModule,
    PlantasModule,
    UnidadesModule,
    EquipamentosModule,
    TiposEquipamentosModule,
    CategoriasEquipamentosModule,
    ConcessionariasModule,

    // Service-only
    AnomaliasModule,
    PlanosManutencaoModule,
    TarefasModule,
    AgendaModule,
    VeiculosModule,
    ReservasModule,
    ProgramacaoOSModule,
    ExecucaoOSModule,
    SolicitacoesServicoModule,
    InstrucoesModule,
    DashboardModule,
    UploadsModule,

    // Mantidos: dependencias do MQTT infrastructure
    EquipamentosDadosModule,
    RegrasLogsMqttModule,
    LogsMqttModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    AppService,
  ],
})
export class AppModule {}
