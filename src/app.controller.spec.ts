import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@aupus/api-shared';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          // AppService injeta o Prisma para o /health; getHello nao usa o banco.
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('deve retornar a mensagem de status da API', () => {
      expect(appController.getHello()).toContain('API de Manutenção Industrial');
    });
  });
});
