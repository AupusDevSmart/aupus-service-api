import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@aupus/api-shared';
import { generateMockToken } from './helpers/auth.helper';

/**
 * Testes E2E do fluxo completo de Ordens de Servico
 *
 * Fluxo testado:
 *   1. Criar origem (anomalia ou solicitacao)
 *   2. Criar programacao a partir da origem
 *   3. Aprovar programacao (gera OS automaticamente)
 *   4. Executar OS: iniciar → pausar → retomar → executar → auditar → finalizar
 *   5. Verificar propagacao de status em todas as entidades
 *
 * Tambem testa:
 *   - Campos de auditoria (criado_por, aprovado_por, finalizado_por)
 *   - Heranca de dados da programacao para a OS
 *   - Cancelamento e reversao de status
 */
describe('Fluxo Completo OS (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let userId: string;
  let userName: string;
  let plantaId: string;
  let equipamentoId: string;

  // IDs para cleanup
  const idsParaLimpar = {
    anomalias: [] as string[],
    solicitacoes: [] as string[],
    programacoes: [] as string[],
    ordensServico: [] as string[],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    prisma = app.get<PrismaService>(PrismaService);

    await app.init();

    // Autenticar com usuario admin
    const usuario = await prisma.usuarios.findFirst({
      where: { email: 'admin@email.com' },
    });
    if (!usuario) {
      throw new Error('Usuario admin@email.com nao encontrado no banco');
    }
    userId = usuario.id;
    userName = usuario.nome;
    authToken = generateMockToken(usuario.id, usuario.nome, usuario.email);

    // Buscar planta e equipamento existentes
    const planta = await prisma.plantas.findFirst();
    if (!planta) throw new Error('Nenhuma planta encontrada no banco');
    plantaId = planta.id;

    const equipamento = await prisma.equipamentos.findFirst({
      where: { planta_id: plantaId },
    });
    if (equipamento) equipamentoId = equipamento.id;
  }, 30000);

  afterAll(async () => {
    // Limpar na ordem correta (dependencias primeiro)
    for (const osId of idsParaLimpar.ordensServico) {
      await prisma.historico_os.deleteMany({ where: { os_id: osId } });
      await prisma.registros_tempo_os.deleteMany({ where: { os_id: osId } });
      await prisma.checklist_atividades_os.deleteMany({ where: { os_id: osId } });
      await prisma.materiais_os.deleteMany({ where: { os_id: osId } });
      await prisma.ferramentas_os.deleteMany({ where: { os_id: osId } });
      await prisma.tarefas_os.deleteMany({ where: { os_id: osId } });
      await prisma.tecnicos_os.deleteMany({ where: { os_id: osId } });
      await prisma.anexos_os.deleteMany({ where: { os_id: osId } });
      await prisma.ordens_servico.deleteMany({ where: { id: osId } });
    }
    for (const progId of idsParaLimpar.programacoes) {
      await prisma.materiais_programacao_os.deleteMany({ where: { programacao_id: progId } });
      await prisma.ferramentas_programacao_os.deleteMany({ where: { programacao_id: progId } });
      await prisma.tecnicos_programacao_os.deleteMany({ where: { programacao_id: progId } });
      await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: progId } });
      await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: progId } });
      await prisma.programacoes_os.deleteMany({ where: { id: progId } });
    }
    for (const anomId of idsParaLimpar.anomalias) {
      await prisma.anomalias.deleteMany({ where: { id: anomId } });
    }
    for (const solId of idsParaLimpar.solicitacoes) {
      await prisma.historico_solicitacao_servico.deleteMany({ where: { solicitacao_id: solId } });
      await prisma.solicitacoes_servico.deleteMany({ where: { id: solId } });
    }
    await app.close();
  }, 30000);

  // ========================================================================
  // FLUXO 1: ORIGEM ANOMALIA - Fluxo completo ate finalizacao
  // ========================================================================
  describe('Fluxo 1: Origem ANOMALIA (fluxo completo)', () => {
    let anomaliaId: string;
    let programacaoId: string;
    let osId: string;

    // 1. Criar anomalia
    it('1.1 - Deve criar uma anomalia', async () => {
      const response = await request(app.getHttpServer())
        .post('/anomalias')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          descricao: 'E2E: Vazamento de oleo no mancal do motor principal',
          localizacao: {
            equipamentoId: equipamentoId || undefined,
            local: 'Setor A - Linha 1',
            ativo: 'Motor Principal MP-001',
          },
          condicao: 'FUNCIONANDO',
          origem: 'OPERADOR',
          prioridade: 'ALTA',
          observacoes: 'Identificado durante inspecao de rotina. Urgencia moderada.',
        })
        .expect(201);

      anomaliaId = response.body.id;
      idsParaLimpar.anomalias.push(anomaliaId);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('REGISTRADA');
      expect(response.body.descricao).toContain('Vazamento de oleo');
    });

    // 2. Criar programacao a partir da anomalia
    it('1.2 - Deve criar programacao a partir da anomalia', async () => {
      const response = await request(app.getHttpServer())
        .post(`/programacao-os/from-anomalia/${anomaliaId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);

      programacaoId = response.body.id;
      idsParaLimpar.programacoes.push(programacaoId);

      expect(response.body.status).toBe('PENDENTE');
      expect(response.body.origem).toBe('ANOMALIA');
      expect(response.body.tipo).toBe('CORRETIVA');

      // Verificar que criado_por foi salvo
      const prog = await prisma.programacoes_os.findUnique({ where: { id: programacaoId } });
      expect(prog.criado_por).toBe(userName);
      expect(prog.criado_por_id?.trim()).toBe(userId.trim());
    });

    // 3. Verificar anomalia mudou para PROGRAMADA
    it('1.3 - Anomalia deve estar PROGRAMADA', async () => {
      const anomalia = await prisma.anomalias.findUnique({ where: { id: anomaliaId } });
      expect(anomalia.status).toBe('PROGRAMADA');
    });

    // 4. Aprovar programacao (gera OS automaticamente)
    it('1.4 - Deve aprovar programacao e gerar OS', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/programacao-os/${programacaoId}/aprovar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          observacoes: 'Aprovada para execucao imediata',
          data_programada_sugerida: '2026-04-01',
          hora_programada_sugerida: '08:00',
        })
        .expect(200);

      expect(response.body.message).toContain('aprovada');

      // Verificar programacao
      const prog = await prisma.programacoes_os.findUnique({ where: { id: programacaoId } });
      expect(prog.status).toBe('APROVADA');
      expect(prog.aprovado_por).toBe(userName);
      expect(prog.aprovado_por_id?.trim()).toBe(userId.trim());
      expect(prog.data_aprovacao).toBeTruthy();

      // Buscar OS gerada
      const os = await prisma.ordens_servico.findFirst({
        where: { programacao_id: programacaoId, deletado_em: null },
      });
      expect(os).toBeTruthy();
      osId = os.id;
      idsParaLimpar.ordensServico.push(osId);

      // Verificar dados herdados
      expect(os.status).toBe('PENDENTE');
      expect(os.tipo).toBe('CORRETIVA');
      expect(os.origem).toBe('ANOMALIA');
      expect(os.prioridade).toBe('ALTA');
      expect(os.anomalia_id).toBe(anomaliaId);
      expect(os.numero_os).toBeTruthy();
      expect(os.descricao).toContain('Vazamento de oleo');
    });

    // 5. Iniciar execucao
    it('1.5 - Deve iniciar a OS', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/iniciar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          observacoes: 'Iniciando execucao com equipe completa',
        })
        .expect(200);

      expect(response.body.message).toContain('iniciada');

      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('EM_EXECUCAO');
      expect(os.data_hora_inicio_real).toBeTruthy();
    });

    // 6. Pausar execucao
    it('1.6 - Deve pausar a OS', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/pausar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          motivo_pausa: 'Aguardando peca de reposicao',
          observacoes: 'Peca prevista para amanha',
        })
        .expect(200);

      expect(response.body.message).toContain('pausada');

      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('PAUSADA');
    });

    // 7. Retomar execucao
    it('1.7 - Deve retomar a OS', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/retomar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          observacoes_retomada: 'Peca recebida, retomando execucao',
        })
        .expect(200);

      expect(response.body.message).toContain('retomada');

      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('EM_EXECUCAO');
    });

    // 8. Executar (registrar resultado)
    it('1.8 - Deve executar a OS', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/executar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          resultado_servico: 'Mancal substituido com sucesso. Teste de funcionamento OK.',
          problemas_encontrados: 'Desgaste acentuado no rolamento interno',
          recomendacoes: 'Monitorar vibracao nos proximos 30 dias',
          atividades_realizadas: 'Desmontagem, limpeza, substituicao do mancal e teste',
          procedimentos_seguidos: 'NR-12, procedimento interno MT-001',
          equipamentos_seguranca: 'Luvas, oculos, protetor auricular',
        })
        .expect(200);

      expect(response.body.message).toContain('executada');

      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('EXECUTADA');
      expect(os.resultado_servico).toContain('Mancal substituido');
      expect(os.problemas_encontrados).toContain('Desgaste');
      expect(os.recomendacoes).toContain('vibracao');
      expect(os.data_hora_fim_real).toBeTruthy();
    });

    // 9. Auditar
    it('1.9 - Deve auditar a OS', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/auditar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          avaliacao_qualidade: 4,
          observacoes_qualidade: 'Servico bem executado. Documentacao completa.',
        })
        .expect(200);

      expect(response.body.message).toContain('auditada');

      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('AUDITADA');
      expect(os.avaliacao_qualidade).toBe(4);
      expect(os.observacoes_qualidade).toContain('bem executado');
      expect(os.aprovado_por).toBe(userName);
      expect(os.aprovado_por_id?.trim()).toBe(userId.trim());
      expect(os.data_aprovacao).toBeTruthy();
    });

    // 10. Finalizar
    it('1.10 - Deve finalizar a OS e propagar status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/finalizar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          observacoes: 'OS concluida sem pendencias',
        })
        .expect(200);

      expect(response.body.message).toContain('finalizada');

      // Verificar OS
      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('FINALIZADA');
      expect(os.finalizado_por).toBe(userName);
      expect(os.finalizado_por_id?.trim()).toBe(userId.trim());

      // Verificar programacao → FINALIZADA
      const prog = await prisma.programacoes_os.findUnique({ where: { id: programacaoId } });
      expect(prog.status).toBe('FINALIZADA');
      expect(prog.finalizado_por).toBe(userName);
      expect(prog.finalizado_por_id?.trim()).toBe(userId.trim());
      expect(prog.data_finalizacao).toBeTruthy();

      // Verificar anomalia → FINALIZADA
      const anomalia = await prisma.anomalias.findUnique({ where: { id: anomaliaId } });
      expect(anomalia.status).toBe('FINALIZADA');
    });

    // 11. Verificar historico
    it('1.11 - Deve ter registros de historico para todas as transicoes', async () => {
      const historico = await prisma.historico_os.findMany({
        where: { os_id: osId },
        orderBy: { data: 'asc' },
      });

      expect(historico.length).toBeGreaterThanOrEqual(6);

      const acoes = historico.map(h => h.acao);
      expect(acoes).toContain('INICIO_EXECUCAO');
      expect(acoes).toContain('PAUSA');
      expect(acoes).toContain('RETOMADA');
      expect(acoes).toContain('EXECUCAO');
      expect(acoes).toContain('AUDITORIA');
      expect(acoes).toContain('FINALIZACAO');
    });
  });

  // ========================================================================
  // FLUXO 2: ORIGEM SOLICITACAO DE SERVICO - Fluxo completo ate finalizacao
  // ========================================================================
  describe('Fluxo 2: Origem SOLICITACAO DE SERVICO (fluxo completo)', () => {
    let solicitacaoId: string;
    let programacaoId: string;
    let osId: string;

    // 1. Criar solicitacao
    it('2.1 - Deve criar uma solicitacao de servico', async () => {
      const payload: Record<string, any> = {
        titulo: 'E2E: Instalacao de sistema de monitoramento',
        descricao: 'Instalar sensores de vibracao e temperatura no compressor principal',
        tipo: 'MANUTENCAO_PREVENTIVA',
        prioridade: 'MEDIA',
        planta_id: plantaId,
        local: 'Setor B - Compressores',
        justificativa: 'Necessario para monitoramento preditivo conforme plano de manutencao',
        beneficios_esperados: 'Reducao de paradas nao programadas em 30%',
        riscos_nao_execucao: 'Possivel falha catastrofica sem aviso previo',
        materiais_necessarios: 'Sensores de vibracao (3x), sensores de temperatura (3x), cabos',
        ferramentas_necessarias: 'Kit instalacao eletrica, multimetro',
        mao_obra_necessaria: '2 tecnicos eletricistas',
        departamento: 'Manutencao Industrial',
        contato: 'ramal 4455',
      };
      if (equipamentoId) payload.equipamento_id = equipamentoId;

      const response = await request(app.getHttpServer())
        .post('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);

      if (response.status !== 201) {
        console.error('Erro ao criar solicitacao:', JSON.stringify(response.body, null, 2));
      }
      expect(response.status).toBe(201);

      solicitacaoId = response.body.id;
      idsParaLimpar.solicitacoes.push(solicitacaoId);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('REGISTRADA');
      expect(response.body.titulo).toContain('monitoramento');
    });

    // 2. Criar programacao a partir da solicitacao
    it('2.2 - Deve criar programacao a partir da solicitacao', async () => {
      const response = await request(app.getHttpServer())
        .post(`/programacao-os/from-solicitacao/${solicitacaoId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);

      programacaoId = response.body.id;
      idsParaLimpar.programacoes.push(programacaoId);

      expect(response.body.status).toBe('PENDENTE');
      expect(response.body.origem).toBe('SOLICITACAO_SERVICO');

      // Verificar criado_por
      const prog = await prisma.programacoes_os.findUnique({ where: { id: programacaoId } });
      expect(prog.criado_por).toBe(userName);
      expect(prog.criado_por_id?.trim()).toBe(userId.trim());
      expect(prog.solicitacao_servico_id?.trim()).toBe(solicitacaoId.trim());
    });

    // 3. Verificar solicitacao mudou para PROGRAMADA
    it('2.3 - Solicitacao deve estar PROGRAMADA', async () => {
      const solicitacao = await prisma.solicitacoes_servico.findUnique({
        where: { id: solicitacaoId },
      });
      expect(solicitacao.status).toBe('PROGRAMADA');
    });

    // 4. Aprovar programacao
    it('2.4 - Deve aprovar programacao e gerar OS', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/programacao-os/${programacaoId}/aprovar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          observacoes: 'Aprovada. Equipe e materiais disponiveis.',
          data_programada_sugerida: '2026-04-15',
          hora_programada_sugerida: '07:30',
        })
        .expect(200);

      expect(response.body.message).toContain('aprovada');

      // Verificar programacao
      const prog = await prisma.programacoes_os.findUnique({ where: { id: programacaoId } });
      expect(prog.status).toBe('APROVADA');
      expect(prog.aprovado_por).toBe(userName);

      // Buscar OS gerada
      const os = await prisma.ordens_servico.findFirst({
        where: { programacao_id: programacaoId, deletado_em: null },
      });
      expect(os).toBeTruthy();
      osId = os.id;
      idsParaLimpar.ordensServico.push(osId);

      expect(os.status).toBe('PENDENTE');
      expect(os.origem).toBe('SOLICITACAO_SERVICO');
      expect(os.numero_os).toBeTruthy();
    });

    // 5. Iniciar
    it('2.5 - Deve iniciar a OS', async () => {
      await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/iniciar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ observacoes: 'Equipe mobilizada' })
        .expect(200);

      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('EM_EXECUCAO');
    });

    // 6. Executar (direto, sem pausar)
    it('2.6 - Deve executar a OS', async () => {
      await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/executar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          resultado_servico: 'Sensores instalados e calibrados. Sistema online.',
          atividades_realizadas: 'Instalacao de 3 sensores de vibracao e 3 de temperatura, cabeamento e configuracao',
          procedimentos_seguidos: 'NR-10, manual do fabricante',
          equipamentos_seguranca: 'Luvas isolantes, oculos, capacete',
        })
        .expect(200);

      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('EXECUTADA');
      expect(os.resultado_servico).toContain('Sensores instalados');
    });

    // 7. Auditar
    it('2.7 - Deve auditar a OS', async () => {
      await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/auditar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          avaliacao_qualidade: 5,
          observacoes_qualidade: 'Excelente. Todos os sensores operacionais.',
        })
        .expect(200);

      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('AUDITADA');
      expect(os.avaliacao_qualidade).toBe(5);
      expect(os.aprovado_por).toBe(userName);
    });

    // 8. Finalizar e verificar propagacao completa
    it('2.8 - Deve finalizar a OS e propagar status ate a solicitacao', async () => {
      await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/finalizar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ observacoes: 'Sistema de monitoramento em operacao' })
        .expect(200);

      // OS → FINALIZADA
      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('FINALIZADA');
      expect(os.finalizado_por).toBe(userName);
      expect(os.finalizado_por_id?.trim()).toBe(userId.trim());

      // Programacao → FINALIZADA
      const prog = await prisma.programacoes_os.findUnique({ where: { id: programacaoId } });
      expect(prog.status).toBe('FINALIZADA');
      expect(prog.finalizado_por).toBe(userName);
      expect(prog.data_finalizacao).toBeTruthy();

      // Solicitacao → FINALIZADA (propagacao de 3 niveis: OS → Prog → Solic)
      const solicitacao = await prisma.solicitacoes_servico.findUnique({
        where: { id: solicitacaoId },
      });
      expect(solicitacao.status).toBe('FINALIZADA');
    });
  });

  // ========================================================================
  // FLUXO 3: CANCELAMENTO - Verificar reversao de status
  // ========================================================================
  describe('Fluxo 3: Cancelamento de OS (reversao de status)', () => {
    let anomaliaId: string;
    let programacaoId: string;
    let osId: string;

    it('3.1 - Setup: criar anomalia, programacao e aprovar', async () => {
      // Criar anomalia
      const anomRes = await request(app.getHttpServer())
        .post('/anomalias')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          descricao: 'E2E Cancel: Superaquecimento no transformador',
          localizacao: { local: 'Subestacao 01', ativo: 'Transformador TR-01' },
          condicao: 'FUNCIONANDO',
          origem: 'SCADA',
          prioridade: 'CRITICA',
        })
        .expect(201);

      anomaliaId = anomRes.body.id;
      idsParaLimpar.anomalias.push(anomaliaId);

      // Criar programacao
      const progRes = await request(app.getHttpServer())
        .post(`/programacao-os/from-anomalia/${anomaliaId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);

      programacaoId = progRes.body.id;
      idsParaLimpar.programacoes.push(programacaoId);

      // Aprovar
      await request(app.getHttpServer())
        .patch(`/programacao-os/${programacaoId}/aprovar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ observacoes: 'Aprovada para teste de cancelamento' })
        .expect(200);

      // Pegar OS
      const os = await prisma.ordens_servico.findFirst({
        where: { programacao_id: programacaoId, deletado_em: null },
      });
      osId = os.id;
      idsParaLimpar.ordensServico.push(osId);

      // Iniciar
      await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/iniciar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ observacoes: 'Iniciando para depois cancelar' })
        .expect(200);

      const osAtualizada = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(osAtualizada.status).toBe('EM_EXECUCAO');
    });

    it('3.2 - Deve cancelar OS e reverter anomalia para REGISTRADA', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/cancelar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          motivo_cancelamento: 'Problema foi resolvido automaticamente pelo sistema SCADA',
          observacoes: 'Temperatura normalizou apos ajuste automatico',
        })
        .expect(200);

      expect(response.body.message).toContain('cancelada');

      // OS → CANCELADA
      const os = await prisma.ordens_servico.findUnique({ where: { id: osId } });
      expect(os.status).toBe('CANCELADA');
      expect(os.motivo_cancelamento).toContain('resolvido automaticamente');

      // Anomalia → REGISTRADA (revertida)
      const anomalia = await prisma.anomalias.findUnique({ where: { id: anomaliaId } });
      expect(anomalia.status).toBe('REGISTRADA');
    });

    it('3.3 - Historico deve registrar o cancelamento', async () => {
      const historico = await prisma.historico_os.findMany({
        where: { os_id: osId, acao: 'CANCELAMENTO' },
      });
      expect(historico.length).toBe(1);
      expect(historico[0].observacoes).toContain('resolvido automaticamente');
    });
  });

  // ========================================================================
  // FLUXO 4: CANCELAMENTO DE PROGRAMACAO (antes de gerar OS)
  // ========================================================================
  describe('Fluxo 4: Cancelamento de programacao (reversao de solicitacao)', () => {
    let solicitacaoId: string;
    let programacaoId: string;

    it('4.1 - Setup: criar solicitacao e programacao', async () => {
      // Criar solicitacao
      const solRes = await request(app.getHttpServer())
        .post('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          titulo: 'E2E Cancel Prog: Troca de filtros',
          descricao: 'Substituir filtros do sistema de ar',
          tipo: 'MANUTENCAO_PREVENTIVA',
          prioridade: 'BAIXA',
          planta_id: plantaId,
          local: 'Sala de maquinas',
          justificativa: 'Manutencao programada',
        });

      if (solRes.status !== 201) {
        console.error('Erro ao criar solicitacao F4:', JSON.stringify(solRes.body, null, 2));
      }
      expect(solRes.status).toBe(201);

      solicitacaoId = solRes.body.id;
      idsParaLimpar.solicitacoes.push(solicitacaoId);

      // Criar programacao
      const progRes = await request(app.getHttpServer())
        .post(`/programacao-os/from-solicitacao/${solicitacaoId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);

      programacaoId = progRes.body.id;
      idsParaLimpar.programacoes.push(programacaoId);

      // Verificar solicitacao PROGRAMADA
      const sol = await prisma.solicitacoes_servico.findUnique({ where: { id: solicitacaoId } });
      expect(sol.status).toBe('PROGRAMADA');
    });

    it('4.2 - Deve cancelar programacao e reverter solicitacao para REGISTRADA', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/programacao-os/${programacaoId}/cancelar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          motivo_cancelamento: 'Filtros fora de estoque, reprogramar para proximo mes',
        })
        .expect(200);

      expect(response.body.message).toContain('cancelada');

      // Programacao → CANCELADA
      const prog = await prisma.programacoes_os.findUnique({ where: { id: programacaoId } });
      expect(prog.status).toBe('CANCELADA');

      // Solicitacao → REGISTRADA (revertida)
      const sol = await prisma.solicitacoes_servico.findUnique({ where: { id: solicitacaoId } });
      expect(sol.status).toBe('REGISTRADA');
    });
  });

  // ========================================================================
  // FLUXO 5: VALIDACOES DE TRANSICAO INVALIDA
  // ========================================================================
  describe('Fluxo 5: Validacoes de transicoes invalidas', () => {
    let programacaoId: string;
    let osId: string;

    it('5.1 - Setup: criar programacao manual e aprovar', async () => {
      // Criar programacao manual
      const progRes = await request(app.getHttpServer())
        .post('/programacao-os')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          descricao: 'E2E Validacao: Teste de transicoes invalidas',
          condicoes: 'FUNCIONANDO',
          tipo: 'INSPECAO',
          prioridade: 'BAIXA',
          origem: 'MANUAL',
          planta_id: plantaId,
          tempo_estimado: 1,
          responsavel: 'Tecnico Teste',
          observacoes: 'Programacao para teste de validacoes',
        })
        .expect(201);

      programacaoId = progRes.body.id;
      idsParaLimpar.programacoes.push(programacaoId);

      // Aprovar
      await request(app.getHttpServer())
        .patch(`/programacao-os/${programacaoId}/aprovar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(200);

      // Pegar OS
      const os = await prisma.ordens_servico.findFirst({
        where: { programacao_id: programacaoId, deletado_em: null },
      });
      osId = os.id;
      idsParaLimpar.ordensServico.push(osId);
    });

    it('5.2 - Nao deve pausar OS que esta PENDENTE', async () => {
      await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/pausar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ motivo_pausa: 'Teste' })
        .expect(409);
    });

    it('5.3 - Nao deve executar OS que esta PENDENTE', async () => {
      await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/executar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ resultado_servico: 'Teste' })
        .expect(409);
    });

    it('5.4 - Nao deve auditar OS que esta PENDENTE', async () => {
      await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/auditar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ avaliacao_qualidade: 5 })
        .expect(409);
    });

    it('5.5 - Nao deve finalizar OS que esta PENDENTE', async () => {
      await request(app.getHttpServer())
        .patch(`/execucao-os/${osId}/finalizar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(409);
    });

    it('5.6 - Nao deve aprovar programacao ja aprovada', async () => {
      await request(app.getHttpServer())
        .patch(`/programacao-os/${programacaoId}/aprovar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(409);
    });
  });
});
