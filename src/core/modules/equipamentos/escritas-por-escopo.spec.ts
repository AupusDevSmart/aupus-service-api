import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionScopeService } from '../auth/permission-scope.service';
import { PlantaScopeGuard } from '../auth/guards/planta-scope.guard';
import { AtivosFuncionaisController } from '../ativos-funcionais/ativos-funcionais.controller';
import { PlantasController } from '../plantas/plantas.controller';
import { PlantasService } from '../plantas/plantas.service';
import { AnexosUnidadesService } from '../unidades/anexos-unidades.service';
import { UnidadesController } from '../unidades/unidades.controller';
import { UnidadesService } from '../unidades/unidades.service';
import { AnexosEquipamentosService } from './anexos-equipamentos.service';
import { EquipamentosController } from './equipamentos.controller';
import { EquipamentosService } from './equipamentos.service';
import { EquipamentosDataService } from './services/equipamentos-data.service';

/**
 * As escritas dos cadastros por planta conferem o escopo (SN-75). Até o SN-75
 * só as leituras conferiam: o cliente ou o técnico com `.manage` direto
 * editava e apagava equipamento, unidade, planta e posição de outra planta.
 *
 * Pelo guard de verdade, lendo o `@UsePlantaScope` dos handlers de verdade, e
 * pelos handlers que conferem por conta (anexo, dono da planta). Contra
 * Postgres real. Que nenhuma escrita ficou sem: `escopo-das-escritas.spec.ts`.
 */
describe('escritas no escopo da planta (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const guard = new PlantaScopeGuard(new Reflector(), escopo);
  const equipamentosService = new EquipamentosService(prisma, escopo);
  const equipamentos = new EquipamentosController(equipamentosService, new EquipamentosDataService(prisma), new AnexosEquipamentosService(prisma));
  const unidades = new UnidadesController(new UnidadesService(prisma, escopo), equipamentosService, new AnexosUnidadesService(prisma));
  const plantas = new PlantasController(new PlantasService(prisma, escopo));

  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testeescrita${s}`.padEnd(25, '0').slice(0, 25);
  const DONO_A = ID('donoa');
  const DONO_B = ID('donob');
  const TECNICO_A = ID('tecnicoa');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const UNIDADE_A = ID('unidadea');
  const UNIDADE_B = ID('unidadeb');
  const UC_A = ID('uca');
  const UC_B = ID('ucb');
  const CATEGORIA = ID('categoria');
  const POSICAO_A = ID('posicaoa');
  const PREFIXO = 'TESTE-ESCRITA-ESCOPO';
  let anexoDoB: string;
  let anexoDaUnidadeB: string;

  const clienteA = { id: DONO_A, role: 'proprietario' };
  // O escopo do técnico vem do vínculo, não do dono
  const tecnicoA = { id: TECNICO_A, role: 'operador' };
  const admin = { id: DONO_B, role: 'admin' };

  type Requisicao = { params?: Record<string, unknown>; body?: Record<string, unknown>; user?: object };
  /** A rota como o Nest a roda: o guard lê o metadado do handler e o request. */
  const pelaRota = (controller: { prototype: object; name: string }, handler: string, req: Requisicao) =>
    guard.canActivate({
      getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ params: {}, body: {}, query: {}, user: clienteA, ...req }) }),
    } as unknown as ExecutionContext);

  const apagar = async () => {
    await prisma.anexos_equipamentos.deleteMany({ where: { equipamento_id: { in: [UC_A, UC_B] } } });
    await prisma.anexos_unidades.deleteMany({ where: { unidade_id: { in: [UNIDADE_A, UNIDADE_B] } } });
    await prisma.ativos_funcionais.deleteMany({ where: { id: POSICAO_A } });
    await prisma.categorias_equipamentos.deleteMany({ where: { id: CATEGORIA } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UC_A, UC_B] } } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE_A, UNIDADE_B] } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_A } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_A, DONO_B, TECNICO_A] } } });
  };

  beforeAll(async () => {
    await apagar();
    for (const id of [DONO_A, DONO_B, TECNICO_A]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@escrita-escopo.teste` } });
    for (const [id, dono, cnpj] of [[PLANTA_A, DONO_A, '88.000.000/0001-01'], [PLANTA_B, DONO_B, '88.000.000/0001-02']]) {
      await prisma.plantas.create({
        data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
      });
    }
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_A, planta_id: PLANTA_A } });
    for (const [id, planta] of [[UNIDADE_A, PLANTA_A], [UNIDADE_B, PLANTA_B]]) {
      await prisma.unidades.create({ data: { id, planta_id: planta, nome: `${PREFIXO} ${id}`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });
    }
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_B } });
    await prisma.categorias_equipamentos.create({ data: { id: CATEGORIA, nome: `${PREFIXO} categoria` } });
    await prisma.ativos_funcionais.create({ data: { id: POSICAO_A, nome: 'Inversor 1', categoria_id: CATEGORIA, unidade_id: UNIDADE_A } });
    const arquivo = { nome_original: 'manual.pdf', nome_arquivo: 'manual.pdf', caminho: __filename, mime_type: 'application/pdf', tamanho: 10 };
    anexoDoB = (await prisma.anexos_equipamentos.create({ data: { ...arquivo, equipamento_id: UC_B } })).id;
    anexoDaUnidadeB = (await prisma.anexos_unidades.create({ data: { ...arquivo, unidade_id: UNIDADE_B } })).id;
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  describe('equipamentos', () => {
    it('editar, excluir, foto, MQTT e anexo: só o da planta dele; o de fora é "não encontrado"', async () => {
      for (const handler of ['update', 'remove', 'uploadFoto', 'removerFoto', 'configurarMqtt', 'uploadAnexo']) {
        await expect(pelaRota(EquipamentosController, handler, { params: { id: UC_A } })).resolves.toBe(true);
        await expect(pelaRota(EquipamentosController, handler, { params: { id: UC_B } })).rejects.toThrow('Equipamento não encontrado');
      }
      // O admin não tem escopo
      await expect(pelaRota(EquipamentosController, 'update', { params: { id: UC_B }, user: admin })).resolves.toBe(true);
    });

    it('o técnico, pelo vínculo com a planta: a dele passa, a de fora não', async () => {
      await expect(pelaRota(EquipamentosController, 'update', { params: { id: UC_A }, user: tecnicoA })).resolves.toBe(true);
      await expect(pelaRota(EquipamentosController, 'update', { params: { id: UC_B }, user: tecnicoA })).rejects.toThrow('Equipamento não encontrado');
    });

    // Achado da revisão: sem a unidade o equipamento saía de todas as plantas, e só o admin o via
    it('editar não tira a unidade da UC', async () => {
      await expect(equipamentosService.update(UC_A, { unidade_id: null } as never)).rejects.toThrow('Equipamento UC deve ter uma unidade');
      expect((await prisma.equipamentos.findUniqueOrThrow({ where: { id: UC_A } })).unidade_id?.trim()).toBe(UNIDADE_A);
    });

    it('fora do escopo e inexistente dão a mesma resposta (SN-57)', async () => {
      await expect(pelaRota(EquipamentosController, 'update', { params: { id: ID('naoexiste') } })).rejects.toThrow('Equipamento não encontrado');
      await expect(pelaRota(EquipamentosController, 'salvarComponentesUAR', { params: { ucId: UC_B } })).rejects.toThrow('Equipamento UC não encontrado');
    });

    it('criar, criar em lote e o rápido: na unidade ou no pai de outra planta, não', async () => {
      for (const handler of ['create', 'criarEmLote']) {
        await expect(pelaRota(EquipamentosController, handler, { body: { unidade_id: UNIDADE_A } })).resolves.toBe(true);
        await expect(pelaRota(EquipamentosController, handler, { body: { unidade_id: UNIDADE_B } })).rejects.toThrow('Unidade não encontrada');
        await expect(pelaRota(EquipamentosController, handler, { body: { equipamento_pai_id: UC_B } })).rejects.toThrow(
          'Equipamento pai não encontrado ou não é UC',
        );
      }
      await expect(pelaRota(EquipamentosController, 'criarEquipamentoRapido', { body: { unidade_id: UNIDADE_B } })).rejects.toThrow('Unidade não encontrada');
      await expect(pelaRota(EquipamentosController, 'criarComponenteVisual', { params: { unidadeId: UNIDADE_B } })).rejects.toThrow('Unidade não encontrada');
    });

    it('editar não leva o equipamento para outra planta', async () => {
      await expect(pelaRota(EquipamentosController, 'update', { params: { id: UC_A }, body: { unidade_id: UNIDADE_B } })).rejects.toThrow(
        'Unidade não encontrada',
      );
    });

    it('replicar anexos: a origem e cada destino', async () => {
      await expect(
        pelaRota(EquipamentosController, 'replicarAnexos', { body: { origem_equipamento_id: UC_A, destino_equipamento_ids: [UC_A, UC_B] } }),
      ).rejects.toThrow('Equipamento não encontrado');
    });

    it('apagar o anexo de outra planta: "anexo não encontrado", e ele fica', async () => {
      await expect(equipamentos.removerAnexo(anexoDoB, clienteA)).rejects.toThrow('Anexo não encontrado');
      expect(await prisma.anexos_equipamentos.count({ where: { id: anexoDoB, deleted_at: null } })).toBe(1);
    });
  });

  describe('unidades', () => {
    it('criar, editar, excluir e anexar: só na planta dele, e editar não muda de planta', async () => {
      await expect(pelaRota(UnidadesController, 'create', { body: { planta_id: PLANTA_B } })).rejects.toThrow('Planta não encontrada');
      for (const handler of ['update', 'remove', 'uploadAnexo']) {
        await expect(pelaRota(UnidadesController, handler, { params: { id: UNIDADE_B } })).rejects.toThrow('Unidade não encontrada');
      }
      await expect(pelaRota(UnidadesController, 'update', { params: { id: UNIDADE_A }, body: { planta_id: PLANTA_B } })).rejects.toThrow(
        'Planta não encontrada',
      );
      await expect(pelaRota(UnidadesController, 'update', { params: { id: UNIDADE_A }, body: { nome: 'x' } })).resolves.toBe(true);
    });

    it('apagar o anexo de outra planta: "anexo não encontrado", e ele fica', async () => {
      await expect(unidades.removerAnexo(anexoDaUnidadeB, clienteA)).rejects.toThrow('Anexo não encontrado');
      expect(await prisma.anexos_unidades.count({ where: { id: anexoDaUnidadeB, deleted_at: null } })).toBe(1);
    });
  });

  describe('plantas', () => {
    it('editar e excluir: só a dele', async () => {
      for (const handler of ['update', 'remove']) {
        await expect(pelaRota(PlantasController, handler, { params: { id: PLANTA_B } })).rejects.toThrow('Planta não encontrada');
        await expect(pelaRota(PlantasController, handler, { params: { id: PLANTA_A } })).resolves.toBe(true);
      }
    });

    // A regra da planilha, agora também no formulário (dono-da-planta.ts)
    it('o cliente só cria planta em nome próprio e não a passa a outro dono', async () => {
      await expect(plantas.create({ proprietarioId: DONO_B } as never, clienteA)).rejects.toThrow(
        new ForbiddenException('Você só pode criar plantas em que você é o proprietário.'),
      );
      await expect(plantas.update(PLANTA_A, { proprietarioId: DONO_B } as never, clienteA)).rejects.toThrow(
        new ForbiddenException('Você não pode passar a planta para outro proprietário.'),
      );
      expect((await prisma.plantas.findUniqueOrThrow({ where: { id: PLANTA_A } })).proprietario_id.trim()).toBe(DONO_A);
    });
  });

  describe('posições', () => {
    it('criar, instalar, remover e transferir: a posição e o equipamento no escopo', async () => {
      await expect(pelaRota(AtivosFuncionaisController, 'criar', { body: { unidade_id: UNIDADE_B } })).rejects.toThrow('Unidade não encontrada');
      await expect(pelaRota(AtivosFuncionaisController, 'instalar', { params: { id: POSICAO_A }, body: { equipamento_id: UC_B } })).rejects.toThrow(
        'Equipamento não encontrado',
      );
      await expect(pelaRota(AtivosFuncionaisController, 'instalar', { params: { id: POSICAO_A }, body: { equipamento_id: UC_A } })).resolves.toBe(true);
      await expect(
        pelaRota(AtivosFuncionaisController, 'transferir', { params: { equipamentoId: UC_B }, body: { ativo_funcional_id: POSICAO_A } }),
      ).rejects.toThrow('Equipamento não encontrado');
      await expect(pelaRota(AtivosFuncionaisController, 'remover', { params: { id: ID('posicaob') } })).rejects.toThrow('Posição não encontrada');
    });
  });
});
