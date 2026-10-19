import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionScopeService } from '../auth/permission-scope.service';
import { AtivosFuncionaisController } from '../ativos-funcionais/ativos-funcionais.controller';
import { AtivosFuncionaisService } from '../ativos-funcionais/ativos-funcionais.service';
import { AnexosUnidadesService } from '../unidades/anexos-unidades.service';
import { UnidadesController } from '../unidades/unidades.controller';
import { UnidadesService } from '../unidades/unidades.service';
import { AnexosEquipamentosService } from './anexos-equipamentos.service';
import { EquipamentosController } from './equipamentos.controller';
import { EquipamentosService } from './equipamentos.service';
import { EquipamentosDataService } from './services/equipamentos-data.service';

/**
 * As rotas de cadastro por id e as listas que ficaram de fora do escopo por
 * planta (SN-40): anexos, detalhes do componente, estatísticas e dados MQTT do
 * equipamento; anexos e estatísticas da unidade; a lista de UCs; as posições.
 * Todas pedem só `.view`, que o técnico de campo e o cliente têm, e serviam a
 * planta de qualquer um. Pelas rotas de verdade (os controllers), contra
 * Postgres real.
 */
describe('cadastro por id e listas no escopo da planta (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const equipamentosService = new EquipamentosService(prisma, escopo);
  const unidadesService = new UnidadesService(prisma, escopo);
  const equipamentos = new EquipamentosController(equipamentosService, new EquipamentosDataService(prisma), new AnexosEquipamentosService(prisma));
  const unidades = new UnidadesController(unidadesService, equipamentosService, new AnexosUnidadesService(prisma));
  const posicoes = new AtivosFuncionaisController(new AtivosFuncionaisService(prisma), escopo);

  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testecadescopo${s}`.padEnd(25, '0').slice(0, 25);
  const DONO_A = ID('donoa');
  const DONO_B = ID('donob');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const UNIDADE_A = ID('unidadea');
  const UNIDADE_B = ID('unidadeb');
  const UC_A = ID('uca');
  const UAR_A = ID('uara');
  const UC_B = ID('ucb');
  const CATEGORIA = ID('categoria');
  const POSICAO_A = ID('posicaoa');
  const POSICAO_B = ID('posicaob');
  const PREFIXO = 'TESTE-CAD-ESCOPO';

  const clienteA = { id: DONO_A, role: 'proprietario' };
  const tecnicoB = { id: TECNICO_B, role: 'operador' };
  const admin = { id: DONO_B, role: 'admin' };
  const res = { set: () => undefined, setHeader: () => undefined, sendFile: () => undefined } as unknown as Response;
  let anexoDoComponente: string;
  let anexoDaUnidade: string;

  const apagar = async () => {
    await prisma.ativos_funcionais.deleteMany({ where: { id: { in: [POSICAO_A, POSICAO_B] } } });
    await prisma.categorias_equipamentos.deleteMany({ where: { id: CATEGORIA } });
    await prisma.equipamentos.deleteMany({ where: { id: UAR_A } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UC_A, UC_B] } } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE_A, UNIDADE_B] } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_A, DONO_B, TECNICO_B] } } });
  };

  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });
  const unidade = (id: string, plantaId: string) =>
    prisma.unidades.create({ data: { id, planta_id: plantaId, nome: `${PREFIXO} ${id}`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });

  beforeAll(async () => {
    await apagar();
    for (const id of [DONO_A, DONO_B, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@cad-escopo.teste` } });
    await planta(PLANTA_A, DONO_A, '89.000.000/0001-01');
    await planta(PLANTA_B, DONO_B, '89.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    await unidade(UNIDADE_A, PLANTA_A);
    await unidade(UNIDADE_B, PLANTA_B);
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    // Componente (UAR) não tem unidade: a planta vem do UC pai
    await prisma.equipamentos.create({ data: { id: UAR_A, nome: 'Ventoinha A', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC_A } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_B } });

    // O arquivo dos anexos é este spec: só precisa existir em disco
    const arquivo = { nome_original: 'manual.pdf', nome_arquivo: 'manual.pdf', caminho: __filename, mime_type: 'application/pdf', tamanho: 10 };
    anexoDoComponente = (await prisma.anexos_equipamentos.create({ data: { ...arquivo, equipamento_id: UAR_A } })).id;
    anexoDaUnidade = (await prisma.anexos_unidades.create({ data: { ...arquivo, unidade_id: UNIDADE_A } })).id;

    await prisma.categorias_equipamentos.create({ data: { id: CATEGORIA, nome: `${PREFIXO} categoria` } });
    await prisma.ativos_funcionais.create({ data: { id: POSICAO_A, nome: 'Inversor 1', categoria_id: CATEGORIA, unidade_id: UNIDADE_A } });
    await prisma.ativos_funcionais.create({ data: { id: POSICAO_B, nome: 'Inversor 1', categoria_id: CATEGORIA, unidade_id: UNIDADE_B } });
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  describe('equipamentos', () => {
    // O equipamento aparece pelo nome da posição: a busca tem de achar por ele também
    it('GET /equipamentos?search: acha pelo nome da posição, que é o nome que a lista mostra', async () => {
      await prisma.equipamentos.update({ where: { id: UC_A }, data: { ativo_funcional_id: POSICAO_A } });
      try {
        const achados = await equipamentosService.findAll({ search: 'inversor 1', page: 1, limit: 50 }, admin);

        expect(achados.data.find((e) => e.id.trim() === UC_A)).toMatchObject({ nome: 'Inversor 1', nome_proprio: 'Inversor A' });
      } finally {
        await prisma.equipamentos.update({ where: { id: UC_A }, data: { ativo_funcional_id: null } });
      }
    });

    it('GET /equipamentos/ucs-disponiveis: só as UCs do escopo', async () => {
      const ucs = async (user: { id: string; role: string }) =>
        (await equipamentos.findEquipamentosUC(user)).map((e) => e.id.trim()).filter((id) => [UC_A, UC_B].includes(id)).sort();
      expect(await ucs(clienteA)).toEqual([UC_A]);
      expect(await ucs(tecnicoB)).toEqual([UC_B]);
      expect(await ucs(admin)).toEqual([UC_A, UC_B]);
    });

    it('GET /equipamentos/:id/anexos: o cliente lista os do componente; o técnico de outra planta, 404', async () => {
      expect((await equipamentos.listarAnexos(UAR_A, clienteA)).map((a) => a.id.trim())).toEqual([anexoDoComponente.trim()]);
      await expect(equipamentos.listarAnexos(UAR_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GET /equipamentos/anexos/:anexoId/download: pelo equipamento do anexo', async () => {
      (await equipamentos.downloadAnexo(anexoDoComponente, res, clienteA)).getStream().destroy();
      await expect(equipamentos.downloadAnexo(anexoDoComponente, res, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GET /equipamentos/uar/:id/detalhes: 404 para o técnico de outra planta', async () => {
      await expect(equipamentos.findUARDetalhes(UAR_A, clienteA)).resolves.toBeDefined();
      await expect(equipamentos.findUARDetalhes(UAR_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GET /equipamentos/unidades/:unidadeId/estatisticas: 404 para o técnico de outra planta', async () => {
      await expect(equipamentos.getEstatisticasUnidade(UNIDADE_A, clienteA)).resolves.toBeDefined();
      await expect(equipamentos.getEstatisticasUnidade(UNIDADE_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GET /equipamentos/:id/dados/atual e /historico: 404 para o técnico de outra planta', async () => {
      await expect(equipamentos.obterDadoAtual(UC_A, clienteA)).resolves.toBeDefined();
      await expect(equipamentos.obterDadoAtual(UC_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(equipamentos.obterHistorico(UC_A, clienteA)).resolves.toBeDefined();
      await expect(equipamentos.obterHistorico(UC_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('unidades', () => {
    it('GET /unidades/:id/anexos: o cliente lista; o técnico de outra planta, 404', async () => {
      expect((await unidades.listarAnexos(UNIDADE_A, clienteA)).map((a) => a.id.trim())).toEqual([anexoDaUnidade.trim()]);
      await expect(unidades.listarAnexos(UNIDADE_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GET /unidades/anexos/:anexoId/download: pela unidade do anexo', async () => {
      await expect(unidades.baixarAnexo(anexoDaUnidade, res, clienteA)).resolves.toBeUndefined();
      await expect(unidades.baixarAnexo(anexoDaUnidade, res, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GET /unidades/:id/estatisticas e /:id/equipamentos/estatisticas: 404 para o técnico de outra planta', async () => {
      await expect(unidades.getEstatisticas(UNIDADE_A, clienteA)).resolves.toBeDefined();
      await expect(unidades.getEstatisticas(UNIDADE_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(unidades.getEstatisticasEquipamentos(UNIDADE_A, clienteA)).resolves.toBeDefined();
      await expect(unidades.getEstatisticasEquipamentos(UNIDADE_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('posições (ativos funcionais)', () => {
    it('GET /ativos-funcionais: só as das unidades do escopo', async () => {
      const vistas = async (user: { id: string; role: string }) =>
        (await posicoes.listar({}, user)).map((p) => p.id.trim()).filter((id) => [POSICAO_A, POSICAO_B].includes(id)).sort();
      expect(await vistas(clienteA)).toEqual([POSICAO_A]);
      expect(await vistas(tecnicoB)).toEqual([POSICAO_B]);
      expect(await vistas(admin)).toEqual([POSICAO_A, POSICAO_B]);
    });

    it('GET /ativos-funcionais/:id, /:id/historico e /:id/plano-a-herdar: 404 para o técnico de outra planta', async () => {
      expect((await posicoes.buscarPorId(POSICAO_A, clienteA)).id.trim()).toBe(POSICAO_A);
      await expect(posicoes.buscarPorId(POSICAO_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(posicoes.historico(POSICAO_A, clienteA)).resolves.toEqual([]);
      await expect(posicoes.historico(POSICAO_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(posicoes.planoAHerdar(POSICAO_A, tecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
