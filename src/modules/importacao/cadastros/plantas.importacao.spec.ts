import { PermissionScopeService, PlantasService, PrismaService, UnidadesService } from '@/core';
import { ImportacaoService } from '../importacao.service';
import { RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { PlantasImportacao } from './plantas.importacao';

/**
 * Plantas pela planilha — com as unidades como seção da ficha e o escopo por
 * planta de quem importa.
 */
describe('Importação de plantas (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const importacao = new ImportacaoService(prisma);
  const plantas = new PlantasImportacao(new PlantasService(prisma, escopo), new UnidadesService(prisma, escopo), escopo, prisma);

  const DONO = 'testeimpplantadono0000001';
  const OUTRO = 'testeimpplantaoutro000001';
  const CONCESSIONARIA = 'TESTEIMPPLANTACONCESS0001';
  const admin: UsuarioDaImportacao = { id: 'admin', role: 'admin', permissions: ['plantas.manage', 'unidades.manage'] };
  const proprietario: UsuarioDaImportacao = { id: DONO, role: 'proprietario', permissions: ['plantas.manage', 'unidades.manage'] };
  const CNPJ = '93.000.000/0001-01';

  beforeAll(async () => {
    for (const [id, nome] of [[DONO, 'Dono Planta Importacao'], [OUTRO, 'Outro Dono Importacao']]) {
      await prisma.usuarios.upsert({
        where: { id },
        update: { role: 'proprietario', is_active: true, deleted_at: null },
        create: { id, nome, email: `${id}@importacao.teste`, role: 'proprietario' },
      });
    }
    await prisma.concessionarias_energia.upsert({
      where: { id: CONCESSIONARIA },
      update: { deleted_at: null },
      create: {
        id: CONCESSIONARIA, nome: 'Concessionária Importação Teste', estado: 'GO',
        data_inicio: new Date('2026-01-01'), data_validade: new Date('2027-01-01'),
      },
    });
  });

  const limpar = async () => {
    const ids = (await prisma.plantas.findMany({ where: { cnpj: { startsWith: '93.000.000' } } })).map((p) => p.id);
    await prisma.unidades.deleteMany({ where: { planta_id: { in: ids } } });
    await prisma.plantas.deleteMany({ where: { id: { in: ids } } });
  };

  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.concessionarias_energia.deleteMany({ where: { id: CONCESSIONARIA } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO, OUTRO] } } });
    await prisma.$disconnect();
  });

  const ficha = (dados: Record<string, unknown> = {}, id: string | null = null): RegistroImportado => ({
    id,
    aba: '01',
    linha: 1,
    atualizado_em: null,
    dados: {
      nome: 'Planta Importação',
      cnpj: CNPJ,
      proprietario: 'Dono Planta Importacao',
      numero_uc: null,
      horarioFuncionamento: '08:00-18:00',
      localizacao: 'Zona rural',
      endereco: { cep: '74000-000', logradouro: 'Rodovia GO-060', bairro: 'Zona rural', cidade: 'Goiânia', uf: 'GO' },
      unidades: [
        { _linha: 20, nome: 'UFV 1', tipo: 'Geração', status: 'ativo', latitude: -16.68, longitude: -49.25, concessionaria: 'concessionaria importacao teste' },
        { _linha: 21, nome: 'Carga 1', tipo: 'Carga', status: 'ativo', latitude: -16.69, longitude: -49.26 },
      ],
      ...dados,
    },
  });

  const plantaDoBanco = () => prisma.plantas.findFirst({ where: { cnpj: CNPJ } });
  const unidadesDoBanco = async () =>
    prisma.unidades.findMany({ where: { planta_id: (await plantaDoBanco())!.id, deleted_at: null }, orderBy: { nome: 'asc' } });

  it('cria a planta e as unidades; a unidade herda UF e cidade; concessionária pelo nome', async () => {
    const r = await importacao.importar(plantas, [ficha()], true, admin);

    expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
    const u = await unidadesDoBanco();
    expect(u.map((x) => [x.nome, x.estado, x.cidade, x.concessionaria_id?.trim() ?? null])).toEqual([
      ['Carga 1', 'GO', 'Goiânia', null],
      ['UFV 1', 'GO', 'Goiânia', CONCESSIONARIA],
    ]);
  });

  it('reimportar sem mexer não muda nada — nem com CEP e CNPJ antigos fora da regra de hoje', async () => {
    await importacao.importar(plantas, [ficha()], true, admin);
    const p = (await plantaDoBanco())!;
    await prisma.plantas.update({ where: { id: p.id }, data: { cep: '74000000' } });
    const [carga, ufv] = await unidadesDoBanco();

    const r = await importacao.importar(
      plantas,
      [
        ficha(
          {
            proprietario_ref: DONO,
            endereco: { cep: '74000000', logradouro: 'Rodovia GO-060', bairro: 'Zona rural', cidade: 'Goiânia', uf: 'GO' },
            unidades: [
              { id: ufv.id.trim(), nome: 'UFV 1', tipo: 'Geração', status: 'ativo', latitude: -16.68, longitude: -49.25, concessionaria: 'Concessionária Importação Teste', concessionaria_ref: CONCESSIONARIA },
              { id: carga.id.trim(), nome: 'Carga 1', tipo: 'Carga', status: 'ativo', latitude: -16.69, longitude: -49.26 },
            ],
          },
          p.id.trim(),
        ),
      ],
      true,
      admin,
    );

    expect(r).toMatchObject({ inalterados: 1, alterados: 0, erros: [] });
  });

  it('unidade que sumiu da seção não é apagada', async () => {
    await importacao.importar(plantas, [ficha()], true, admin);
    const p = (await plantaDoBanco())!;
    const [carga] = await unidadesDoBanco();

    const r = await importacao.importar(
      plantas,
      [ficha({ unidades: [{ id: carga.id.trim(), nome: 'Carga renomeada', tipo: 'Carga', status: 'ativo', latitude: -16.69, longitude: -49.26 }] }, p.id.trim())],
      true,
      admin,
    );

    expect(r.alterados).toBe(1);
    expect((await unidadesDoBanco()).map((u) => u.nome)).toEqual(['Carga renomeada', 'UFV 1']);
  });

  it('proprietário com escopo não edita planta de outro, nem cria planta para outro dono', async () => {
    await importacao.importar(plantas, [ficha({ proprietario: 'Outro Dono Importacao' })], true, admin);
    const p = (await plantaDoBanco())!;

    const editar = await importacao.importar(plantas, [ficha({ nome: 'Invadida' }, p.id.trim())], true, proprietario);
    expect(editar.erros[0]).toMatchObject({ campo: 'id', mensagem: expect.stringContaining('Não existe planta com o ID') });
    expect((await plantaDoBanco())!.nome).toBe('Planta Importação');

    const criar = await importacao.importar(
      plantas,
      [ficha({ cnpj: '93.000.000/0001-02', proprietario: 'Outro Dono Importacao' })],
      false,
      proprietario,
    );
    expect(criar.erros[0].mensagem).toBe('Você só pode criar plantas em que você é o proprietário.');
  });

  it('erro de uma unidade aponta a linha dela', async () => {
    const r = await importacao.importar(
      plantas,
      [ficha({ unidades: [{ _linha: 20, nome: 'UFV 1', tipo: 'Eólica', status: 'ativo', latitude: -16.68, longitude: -49.25 }] })],
      false,
      admin,
    );

    expect(r.erros).toEqual([expect.objectContaining({ linha: 20, campo: 'unidades.0.tipo' })]);
  });
});
