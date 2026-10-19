import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PermissionScopeService, PrismaService } from '@/core';
import { AnomaliasController } from './anomalias.controller';
import { AnomaliasService } from './anomalias.service';
import { AnexosAnomaliasService } from './anexos-anomalias.service';

/**
 * Os anexos da anomalia respeitam o escopo por planta (SN-40). Listar, ver e
 * baixar pediam só `anomalias.view` — que o técnico de campo e o cliente têm —
 * e não conferiam a planta: o técnico de uma planta baixava a foto da anomalia
 * de outra pelo id do anexo. Pela rota de verdade (o controller), contra
 * Postgres real.
 */
describe('anexos da anomalia no escopo (banco real)', () => {
  const prisma = new PrismaService();
  const anexos = new AnexosAnomaliasService(prisma);
  const controller = new AnomaliasController(new AnomaliasService(prisma, new PermissionScopeService(prisma)), anexos);

  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testeanexoanom${s}`.padEnd(25, '0').slice(0, 25);
  const DONO_A = ID('donoa');
  const DONO_B = ID('donob');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const UNIDADE_A = ID('unidadea');
  const UC_A = ID('uca');
  const UAR_A = ID('uara');
  const PREFIXO = 'TESTE-ANEXO-ANOMALIA';

  const clienteA = { id: DONO_A, role: 'proprietario' };
  const tecnicoB = { id: TECNICO_B, role: 'operador' };
  const res = { set: () => undefined } as unknown as Response;

  let anomaliaA: string;
  let anexoA: string;

  const apagar = async () => {
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: UAR_A } });
    await prisma.equipamentos.deleteMany({ where: { id: UC_A } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE_A } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_A, DONO_B, TECNICO_B] } } });
  };

  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });

  beforeAll(async () => {
    await apagar();
    for (const id of [DONO_A, DONO_B, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@anexo-anomalia.teste` } });
    await planta(PLANTA_A, DONO_A, '85.000.000/0001-01');
    await planta(PLANTA_B, DONO_B, '85.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    await prisma.unidades.create({ data: { id: UNIDADE_A, planta_id: PLANTA_A, nome: `${PREFIXO} unidade`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    await prisma.equipamentos.create({ data: { id: UAR_A, nome: 'Ventoinha A', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC_A } });

    // Anomalia antiga, do componente e sem planta gravada: a planta vem do UC pai
    anomaliaA = (await prisma.anomalias.create({ data: { descricao: `${PREFIXO} A`, local: 'x', ativo: 'x', origem: 'OPERADOR', equipamento_id: UAR_A } })).id;
    anexoA = (
      await prisma.anexos_anomalias.create({
        // O arquivo é este spec: só precisa existir em disco
        data: { nome: 'foto.jpg', nome_original: 'foto.jpg', tipo: 'imagem', mime_type: 'image/jpeg', tamanho: 10, caminho_s3: __filename, anomalia_id: anomaliaA },
      })
    ).id;
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  describe('GET /anomalias/:id/anexos', () => {
    it('o cliente da planta lista', async () => {
      expect((await controller.listarAnexosAnomalia(anomaliaA, clienteA)).map((a) => a.id.trim())).toEqual([anexoA.trim()]);
    });

    it('o técnico de outra planta é recusado (404)', async () => {
      await expect(controller.listarAnexosAnomalia(anomaliaA, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('GET /anomalias/anexos/:anexoId', () => {
    it('pela anomalia do anexo: o cliente vê, o técnico de outra planta não', async () => {
      expect((await controller.buscarAnexo(anexoA, clienteA)).id.trim()).toBe(anexoA.trim());
      await expect(controller.buscarAnexo(anexoA, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('GET /anomalias/anexos/:anexoId/download', () => {
    it('o cliente da planta baixa', async () => {
      const arquivo = await controller.downloadAnexo(anexoA, res, clienteA);
      arquivo.getStream().destroy();
    });

    it('o técnico de outra planta é recusado (404) antes de abrir o arquivo', async () => {
      await expect(controller.downloadAnexo(anexoA, res, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
