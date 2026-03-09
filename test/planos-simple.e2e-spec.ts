import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Planos de Manutenção - Simple Test (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  const adminCredentials = {
    email: 'admin@email.com',
    senha: 'Aupus123!'
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();

    // Login
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send(adminCredentials);

    authToken = loginResponse.body.access_token || loginResponse.body.token;
    console.log('✅ Login successful, token obtained');
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('GET /planos-manutencao/dashboard', () => {
    it('should return dashboard statistics', async () => {
      const response = await request(app.getHttpServer())
        .get('/planos-manutencao/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      console.log('✅ Dashboard response:', JSON.stringify(response.body, null, 2));

      expect(response.body).toHaveProperty('total_planos');
      expect(typeof response.body.total_planos).toBe('number');
    });
  });

  describe('GET /planos-manutencao', () => {
    it('should list plans with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/planos-manutencao')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 5 })
        .expect(200);

      console.log('✅ List response:', {
        total: response.body.total,
        page: response.body.page,
        limit: response.body.limit,
        count: response.body.data?.length
      });

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('totalPages');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(typeof response.body.total).toBe('number');
      expect(typeof response.body.page).toBe('number');
      expect(typeof response.body.limit).toBe('number');
    });
  });
});
