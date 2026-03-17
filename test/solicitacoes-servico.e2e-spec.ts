import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';
import { generateMockToken } from './helpers/auth.helper';

describe('Solicitações de Serviço (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let solicitacaoId: string;
  let plantaId: string;
  let equipamentoId: string;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    prisma = app.get<PrismaService>(PrismaService);

    await app.init();

    // Get specific admin user from database for auth token
    const usuario = await prisma.usuarios.findFirst({ where: { email: 'admin@email.com' } });
    if (!usuario) {
      throw new Error('No active user found in database for testing');
    }

    // Generate auth token for tests with real user
    authToken = generateMockToken(usuario.id, usuario.nome, usuario.email);

    // Buscar planta existente para testes
    const planta = await prisma.plantas.findFirst();
    if (planta) {
      plantaId = planta.id;
    } else {
      console.warn('⚠️ Nenhuma planta encontrada no banco. Alguns testes serão pulados.');
    }

    const equipamento = await prisma.equipamentos.findFirst({
      where: { planta_id: plantaId },
    });
    if (equipamento) {
      equipamentoId = equipamento.id;
    }
  });

  afterAll(async () => {
    // Limpar dados de teste
    if (solicitacaoId) {
      await prisma.solicitacoes_servico.deleteMany({
        where: { id: solicitacaoId },
      });
    }
    await app.close();
  });

  describe('/solicitacoes-servico (POST)', () => {
    it('deve criar uma nova solicitação de serviço', async () => {
      if (!plantaId) {
        return;
      }
      const response = await request(app.getHttpServer())
        .post('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          titulo: 'Solicitação de Teste',
          descricao: 'Descrição detalhada da solicitação de teste',
          tipo: 'MANUTENCAO_CORRETIVA',
          prioridade: 'MEDIA',
          planta_id: plantaId,
          equipamento_id: equipamentoId,
          local: 'Setor A',
          solicitante_nome: 'João Silva',
          solicitante_email: 'joao@teste.com',
          justificativa: 'Necessário para manter operação',
        })
        .expect((res) => {
          if (res.status !== 201) {
            console.log('❌ Error response:', JSON.stringify(res.body, null, 2));
          }
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('numero');
      expect(response.body.titulo).toBe('Solicitação de Teste');
      expect(response.body.status).toBe('RASCUNHO');
      solicitacaoId = response.body.id;
    });

    it('deve retornar erro 400 ao criar solicitação sem campos obrigatórios', () => {
      return request(app.getHttpServer())
        .post('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          titulo: 'Sem descrição',
        })
        .expect(400);
    });

    it('deve criar solicitação com origem PORTAL por padrão', async () => {
      if (!plantaId) {
        return;
      }
      const response = await request(app.getHttpServer())
        .post('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          titulo: 'Teste Origem',
          descricao: 'Teste de origem padrão',
          tipo: 'OUTRO',
          planta_id: plantaId,
          local: 'Setor B',
          solicitante_nome: 'Maria Santos',
          justificativa: 'Teste',
        })
        .expect(201);

      expect(response.body.origem).toBe('PORTAL');
    });
  });

  describe('/solicitacoes-servico (GET)', () => {
    it('deve listar todas as solicitações com paginação', async () => {
      const response = await request(app.getHttpServer())
        .get('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('total');
    });

    it('deve filtrar solicitações por status', async () => {
      const response = await request(app.getHttpServer())
        .get('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'RASCUNHO' })
        .expect(200);

      expect(response.body.data.every((s) => s.status === 'RASCUNHO')).toBe(true);
    });

    it('deve filtrar solicitações por tipo', async () => {
      const response = await request(app.getHttpServer())
        .get('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ tipo: 'MANUTENCAO_CORRETIVA' })
        .expect(200);

      if (response.body.data.length > 0) {
        expect(response.body.data.every((s) => s.tipo === 'MANUTENCAO_CORRETIVA')).toBe(true);
      }
    });

    it('deve buscar solicitações por termo de busca', () => {
      return request(app.getHttpServer())
        .get('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ search: 'Teste' })
        .expect(200);
    });

    it('deve paginar resultados corretamente', async () => {
      const response = await request(app.getHttpServer())
        .get('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 5 })
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('/solicitacoes-servico/:id (GET)', () => {
    it('deve buscar uma solicitação por ID', async () => {
      if (!solicitacaoId) {
        return;
      }
      const response = await request(app.getHttpServer())
        .get(`/solicitacoes-servico/${solicitacaoId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(solicitacaoId);
      expect(response.body).toHaveProperty('titulo');
      expect(response.body).toHaveProperty('descricao');
      expect(response.body).toHaveProperty('planta');
    });

    it('deve retornar 404 para ID inexistente', () => {
      return request(app.getHttpServer())
        .get('/solicitacoes-servico/id-inexistente-123')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('/solicitacoes-servico/:id (PATCH)', () => {
    it('deve atualizar uma solicitação em rascunho', async () => {
      if (!solicitacaoId) {
        return;
      }
      const response = await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${solicitacaoId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          titulo: 'Título Atualizado',
          prioridade: 'ALTA',
        })
        .expect(200);

      expect(response.body.titulo).toBe('Título Atualizado');
      expect(response.body.prioridade).toBe('ALTA');
    });
  });

  describe('/solicitacoes-servico/:id/enviar (PATCH)', () => {
    it('deve enviar solicitação para análise', async () => {
      if (!solicitacaoId) {
        return;
      }
      const response = await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${solicitacaoId}/enviar`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.status).toBe('AGUARDANDO');
    });

    it('deve retornar erro ao tentar enviar novamente', () => {
      if (!solicitacaoId) {
        return;
      }
      return request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${solicitacaoId}/enviar`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(409); // Conflict - já está aguardando
    });
  });

  describe('/solicitacoes-servico/:id/analisar (PATCH)', () => {
    it('deve iniciar análise da solicitação', async () => {
      if (!solicitacaoId) {
        return;
      }
      const response = await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${solicitacaoId}/analisar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          observacoes_analise: 'Análise iniciada',
        })
        .expect(200);

      expect(response.body.status).toBe('EM_ANALISE');
      expect(response.body.analisado_por_nome).toBeDefined();
    });
  });

  describe('/solicitacoes-servico/:id/aprovar (PATCH)', () => {
    it('deve aprovar uma solicitação em análise', async () => {
      if (!solicitacaoId) {
        return;
      }
      const response = await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${solicitacaoId}/aprovar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          observacoes_aprovacao: 'Aprovado para execução',
        })
        .expect(200);

      expect(response.body.status).toBe('APROVADA');
      expect(response.body.aprovado_por_nome).toBeDefined();
    });
  });

  describe('/solicitacoes-servico/:id/comentarios (POST)', () => {
    it('deve adicionar comentário à solicitação', async () => {
      if (!solicitacaoId) {
        return;
      }
      const response = await request(app.getHttpServer())
        .post(`/solicitacoes-servico/${solicitacaoId}/comentarios`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          comentario: 'Este é um comentário de teste',
          usuario_nome: 'Técnico Teste',
          usuario_id: 'user-123',
        })
        .expect(201);

      expect(response.body.comentario).toBe('Este é um comentário de teste');
      expect(response.body.autor).toBe('Técnico Teste');
    });

    it('deve retornar erro ao adicionar comentário sem texto', () => {
      if (!solicitacaoId) {
        return;
      }
      return request(app.getHttpServer())
        .post(`/solicitacoes-servico/${solicitacaoId}/comentarios`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          usuario_nome: 'Técnico Teste',
        })
        .expect(400);
    });
  });

  describe('/solicitacoes-servico/:id/comentarios (GET)', () => {
    it('deve listar comentários da solicitação', async () => {
      if (!solicitacaoId) {
        return;
      }
      const response = await request(app.getHttpServer())
        .get(`/solicitacoes-servico/${solicitacaoId}/comentarios`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('comentario');
        expect(response.body[0]).toHaveProperty('autor');
      }
    });
  });

  describe('/solicitacoes-servico/stats (GET)', () => {
    it('deve retornar estatísticas das solicitações', async () => {
      const response = await request(app.getHttpServer())
        .get('/solicitacoes-servico/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('aguardando');
      expect(response.body).toHaveProperty('emAnalise');
      expect(response.body).toHaveProperty('aprovadas');
      expect(response.body).toHaveProperty('porPrioridade');
      expect(response.body).toHaveProperty('porTipo');
      expect(response.body).toHaveProperty('taxaAprovacao');
    });
  });

  describe('Workflow completo', () => {
    let workflowSolicitacaoId: string;

    it('deve executar workflow completo: criar > enviar > analisar > rejeitar', async () => {
      if (!plantaId) {
        return;
      }
      // 1. Criar
      const criar = await request(app.getHttpServer())
        .post('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          titulo: 'Workflow Test - Rejeição',
          descricao: 'Teste de workflow completo com rejeição',
          tipo: 'OUTRO',
          planta_id: plantaId,
          local: 'Teste',
          solicitante_nome: 'Teste User',
          justificativa: 'Teste',
        })
        .expect(201);

      workflowSolicitacaoId = criar.body.id;
      expect(criar.body.status).toBe('RASCUNHO');

      // 2. Enviar para análise
      const enviar = await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${workflowSolicitacaoId}/enviar`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(enviar.body.status).toBe('AGUARDANDO');

      // 3. Iniciar análise
      const analisar = await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${workflowSolicitacaoId}/analisar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ observacoes_analise: 'Em análise' })
        .expect(200);

      expect(analisar.body.status).toBe('EM_ANALISE');

      // 4. Rejeitar
      const rejeitar = await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${workflowSolicitacaoId}/rejeitar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          motivo_rejeicao: 'Não atende aos critérios',
          sugestoes_alternativas: 'Revisar e reenviar',
        })
        .expect(200);

      expect(rejeitar.body.status).toBe('REJEITADA');

      // Limpar
      await prisma.solicitacoes_servico.delete({
        where: { id: workflowSolicitacaoId },
      });
    });

    it('deve executar workflow completo: criar > enviar > analisar > aprovar > cancelar', async () => {
      if (!plantaId) {
        return;
      }
      // 1. Criar
      const criar = await request(app.getHttpServer())
        .post('/solicitacoes-servico')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          titulo: 'Workflow Test - Cancelamento',
          descricao: 'Teste de workflow com cancelamento',
          tipo: 'MODIFICACAO',
          planta_id: plantaId,
          local: 'Teste',
          solicitante_nome: 'Teste User',
          justificativa: 'Teste',
        })
        .expect(201);

      workflowSolicitacaoId = criar.body.id;

      // 2. Enviar
      await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${workflowSolicitacaoId}/enviar`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // 3. Analisar
      await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${workflowSolicitacaoId}/analisar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ observacoes_analise: 'Analisando' })
        .expect(200);

      // 4. Aprovar
      const aprovar = await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${workflowSolicitacaoId}/aprovar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ observacoes_aprovacao: 'Aprovado' })
        .expect(200);

      expect(aprovar.body.status).toBe('APROVADA');

      // 5. Cancelar
      const cancelar = await request(app.getHttpServer())
        .patch(`/solicitacoes-servico/${workflowSolicitacaoId}/cancelar`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ motivo_cancelamento: 'Não é mais necessário' })
        .expect(200);

      expect(cancelar.body.status).toBe('CANCELADA');

      // Limpar
      await prisma.solicitacoes_servico.delete({
        where: { id: workflowSolicitacaoId },
      });
    });
  });
});
