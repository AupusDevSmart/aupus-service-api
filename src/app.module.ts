// src/app.module.ts - ATUALIZADO COM USUARIOS MODULE
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './shared/prisma/prisma.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PlantasModule } from './modules/plantas/plantas.module';
import { EquipamentosModule } from './modules/equipamentos/equipamentos.module';
import { AnomaliasModule } from './modules/anomalias/anomalias.module';
import { PlanosManutencaoModule } from './modules/planos-manutencao/planos-manutencao.module';
import { TarefasModule } from './modules/tarefas/tarefas.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { VeiculosModule } from './modules/veiculos/veiculos.module';
import { ReservasModule } from './modules/reservas/reservas.module';
import { ProgramacaoOSModule } from './modules/programacao-os/programacao-os.module';
import { ExecucaoOSModule } from './modules/execucao-os/execucao-os.module';

@Module({
  imports: [
    // ✅ Configuração global
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // ✅ Database
    PrismaModule,

    // ✅ Módulos de negócio
    UsuariosModule,
    RolesModule,
    PermissionsModule,
    PlantasModule,
    EquipamentosModule,
    AnomaliasModule,
    PlanosManutencaoModule,
    TarefasModule,
    AgendaModule,
    VeiculosModule,
    ReservasModule,
    ProgramacaoOSModule,
    ExecucaoOSModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}