import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { PrismaService } from '@/core';
import { ImportacaoService } from '../importacao/importacao.service';
import { MaquinariosImportacao } from '../importacao/cadastros/maquinarios.importacao';
import type { RegistroImportado, UsuarioDaImportacao } from '../importacao/importacao.types';
import { CreateMaquinarioDto } from './dto/maquinario.dto';
import { MaquinariosService } from './maquinarios.service';
import { custoApuradoDoMaquinario } from './regras-do-maquinario';

/**
 * O cadastro de maquinários do AupusProject (SN-84): a regra de custo do
 * instrumento (a amortização na diária do próprio), a rubrica pelo tipo e a
 * planilha de ida e volta.
 */
describe('custo do maquinário', () => {
  const proprio = { tipo: 'proprio', base_calculo: 'diaria', horas_por_diaria: 8, valor_aquisicao: 45000, prazo_retorno_meses: 24, custos_anuais: 3000, meta_utilizacao_horas: 600 };

  it('o próprio por diária: a amortização vezes a jornada', () => {
    // (45000 / 2 + 3000) / 600 = 42,50/h; x 8 = 340,00
    expect(custoApuradoDoMaquinario({ ...proprio, preco_unitario: 300 })).toEqual({ custo_hora: 42.5, preco_base: 340, custo_origem: 'amortizacao' });
  });

  it('sem a amortização, a diária digitada ("diária do cadastro" só no próprio)', () => {
    expect(custoApuradoDoMaquinario({ tipo: 'proprio', base_calculo: 'diaria', preco_unitario: 300 })).toEqual({ custo_hora: null, preco_base: 300, custo_origem: 'diaria_do_cadastro' });
    expect(custoApuradoDoMaquinario({ tipo: 'locacao', base_calculo: 'diaria', preco_unitario: 500 })).toEqual({ custo_hora: null, preco_base: 500, custo_origem: 'preco_unitario' });
  });

  it('nas outras bases, o preço digitado; sem preço, nulo (nunca zero)', () => {
    expect(custoApuradoDoMaquinario({ tipo: 'locacao', base_calculo: 'hora', preco_unitario: 180 })).toMatchObject({ preco_base: 180, custo_origem: 'preco_unitario' });
    expect(custoApuradoDoMaquinario({ tipo: 'locacao', base_calculo: 'fechado', preco_unitario: null })).toMatchObject({ preco_base: null, custo_origem: null });
  });
});

describe('cadastro de maquinários (banco real)', () => {
  const prisma = new PrismaService();
  const maquinarios = new MaquinariosService(prisma);
  const importacao = new ImportacaoService(prisma);
  const cadastro = new MaquinariosImportacao(maquinarios, prisma);
  const usuario: UsuarioDaImportacao = { id: 'admin', role: 'admin', permissions: ['recursos.manage'] };
  const PREFIXO = 'TESTE_MAQ_SN84';

  let linha = 1;
  const registro = (dados: Record<string, unknown>, extra: Partial<RegistroImportado> = {}): RegistroImportado => ({
    id: null,
    aba: 'RESUMO',
    linha: ++linha,
    atualizado_em: null,
    dados,
    ...extra,
  });

  beforeEach(() => prisma.maquinarios.deleteMany({ where: { nome: { startsWith: PREFIXO } } }));
  afterAll(async () => {
    await prisma.maquinarios.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.$disconnect();
  });

  it('a locação nasce com a rubrica de terceirizados e por diária; trocar para próprio leva a rubrica de instruções', async () => {
    const m = await maquinarios.criar({ nome: `${PREFIXO} Munck`, tipo: 'locacao', preco_unitario: 1200 });
    expect(m).toMatchObject({ tipo: 'locacao', base_calculo: 'diaria', rubrica: 'terceirizados', preco_base: 1200 });

    const depois = await maquinarios.atualizar(m.id, { tipo: 'proprio' });
    expect(depois).toMatchObject({ tipo: 'proprio', rubrica: 'instrucoes', custo_origem: 'diaria_do_cadastro' });
  });

  it('o nome não se repete, e "_" no nome não casa com outro (o ILIKE do Prisma casava)', async () => {
    await maquinarios.criar({ nome: `${PREFIXO} Gerador_A`, tipo: 'proprio' });
    await expect(maquinarios.criar({ nome: `${PREFIXO} gerador_a`, tipo: 'locacao' })).rejects.toBeInstanceOf(ConflictException);
    await expect(maquinarios.criar({ nome: `${PREFIXO} GeradorXA`, tipo: 'proprio' })).resolves.toMatchObject({ nome: `${PREFIXO} GeradorXA` });
  });

  it('o DTO recusa tipo, base e rubrica fora da lista', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
    const corpo = (extra: object) => pipe.transform({ nome: 'x', tipo: 'proprio', ...extra }, { type: 'body', metatype: CreateMaquinarioDto });
    await expect(corpo({ tipo: 'emprestado' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo({ base_calculo: 'unidade' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo({ rubrica: 'lucro' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a planilha: linha nova cria; a exportada sem mexer volta "sem mudança" (0 novos, 0 alterados)', async () => {
    const novo = await importacao.importar(cadastro, [registro({ nome: `${PREFIXO} Betoneira`, tipo: 'proprio', preco_unitario: 150 })], true, usuario);
    expect(novo).toMatchObject({ novos: 1, alterados: 0, erros: [] });

    const gravado = await prisma.maquinarios.findFirstOrThrow({ where: { nome: `${PREFIXO} Betoneira` } });
    const comoExportado = registro(
      {
        nome: gravado.nome,
        tipo: 'proprio',
        descricao: null,
        base_calculo: 'diaria',
        rubrica: 'instrucoes',
        preco_unitario: 150,
        valor_aquisicao: null,
        prazo_retorno_meses: null,
        custos_anuais: 0,
        meta_utilizacao_horas: null,
        horas_por_diaria: 8,
        ativo: true,
      },
      { id: gravado.id.trim(), atualizado_em: gravado.updated_at.toISOString() },
    );
    expect(await importacao.importar(cadastro, [comoExportado], false, usuario)).toMatchObject({ novos: 0, alterados: 0, inalterados: 1, erros: [] });
  });
});
