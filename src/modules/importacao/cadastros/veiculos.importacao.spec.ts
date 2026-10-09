import { PermissionScopeService, PrismaService } from '@/core';
import { VeiculosService } from '@/modules/veiculos/veiculos.service';
import { ImportacaoService } from '../importacao.service';
import { RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { VeiculosImportacao } from './veiculos.importacao';

/**
 * Veículos pela planilha — contra Postgres de verdade: o escopo de planta e a
 * trava de reserva ativa são regras do service, e é por ele que a importação
 * passa.
 */
describe('Importação de veículos (banco real)', () => {
  const prisma = new PrismaService();
  const importacao = new ImportacaoService(prisma);
  const veiculos = new VeiculosImportacao(new VeiculosService(prisma, new PermissionScopeService(prisma)), prisma);

  const admin: UsuarioDaImportacao = { id: 'admin', role: 'admin', permissions: ['recursos.manage'] };
  // Proprietário sem planta nenhuma: o escopo dele é vazio.
  const escopado: UsuarioDaImportacao = {
    id: 'TESTEIMPVEICPROPRIET00001',
    role: 'proprietario',
    permissions: ['recursos.manage'],
  };

  const dados = (extra: Record<string, unknown> = {}) => ({
    nome: 'Hilux de teste',
    placa: 'TST1A23',
    marca: 'Toyota',
    modelo: 'Hilux',
    anoFabricacao: 2022,
    tipo: 'caminhonete',
    tipoCombustivel: 'diesel',
    capacidadePassageiros: 5,
    capacidadeCarga: 1000,
    quilometragem: 12000,
    localizacaoAtual: 'Base Goiânia',
    cor: 'Branca',
    proximaRevisao: '2026-12-15',
    responsavel: null,
    chassi: null,
    renavam: null,
    seguradora: null,
    vencimentoSeguro: null,
    observacoes: null,
    ...extra,
  });

  const linha = (d: Record<string, unknown>, id: string | null = null): RegistroImportado => ({
    id,
    aba: 'RESUMO',
    linha: 2,
    atualizado_em: null,
    dados: d,
  });

  const limpar = async () => {
    const ids = (await prisma.veiculo.findMany({ where: { placa: { startsWith: 'TST' } } })).map((v) => v.id);
    await prisma.reserva_veiculo.deleteMany({ where: { veiculo_id: { in: ids } } });
    await prisma.veiculo.deleteMany({ where: { id: { in: ids } } });
  };

  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it('cria pela planilha, com a data de revisão no dia certo', async () => {
    const r = await importacao.importar(veiculos, [linha(dados())], true, admin);

    expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
    const v = await prisma.veiculo.findUniqueOrThrow({ where: { placa: 'TST1A23' } });
    expect(v.proxima_revisao?.toISOString()).toBe('2026-12-15T00:00:00.000Z');
  });

  it('reimportar sem mexer não muda nada, mesmo com reserva ativa (a placa igual sai do payload)', async () => {
    const criado = await importacao.importar(veiculos, [linha(dados())], true, admin);
    const id = criado.registros[0].id;
    await prisma.reserva_veiculo.create({
      data: {
        veiculo_id: id,
        tipo_solicitante: 'manual',
        data_inicio: new Date('2030-01-01'),
        data_fim: new Date('2030-01-02'),
        hora_inicio: '08:00',
        hora_fim: '18:00',
        responsavel: 'Teste',
        finalidade: 'Teste de importação',
        status: 'ativa',
      },
    });

    const r = await importacao.importar(veiculos, [linha(dados(), id)], true, admin);

    expect(r).toMatchObject({ inalterados: 1, alterados: 0, erros: [] });
  });

  it('veículo fora do escopo de quem importa é "não encontrado", e não é tocado', async () => {
    const criado = await importacao.importar(veiculos, [linha(dados())], true, admin);
    const id = criado.registros[0].id;

    const r = await importacao.importar(veiculos, [linha(dados({ nome: 'Invadido' }), id)], true, escopado);

    expect(r.confirmado).toBe(false);
    expect(r.erros[0]).toMatchObject({ campo: 'id', mensagem: expect.stringContaining('Não existe veículo com o ID') });
    expect((await prisma.veiculo.findUniqueOrThrow({ where: { id } })).nome).toBe('Hilux de teste');
  });

  it('placa fora do formato é erro com a frase do formulário', async () => {
    const r = await importacao.importar(veiculos, [linha(dados({ placa: 'tst1a23' }))], false, admin);

    expect(r.erros).toEqual([expect.objectContaining({ campo: 'placa' })]);
  });
});
