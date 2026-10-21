import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { PrismaService } from '@/core';
import { CreateRecursoDto, CategoriaRecurso } from './dto/recurso.dto';
import { RecursosService } from './recursos.service';
import { custoApurado, custoHora, normalizarRecurso } from './regras-do-recurso';

/**
 * O recurso com os campos e as regras do AupusProject (SN-83): as 6
 * categorias, a base de cobrança que a categoria aceita, a rubrica, o que é
 * limpo fora da categoria e o custo do item próprio (amortização).
 */
describe('regras do recurso', () => {
  it('a amortização: (investimento ÷ anos de retorno + custos anuais) ÷ meta', () => {
    expect(custoHora({ valor_aquisicao: 38700, prazo_retorno_meses: 12, custos_anuais: 2500, meta_utilizacao_horas: 150 })).toBe(274.67);
    // Em 24 meses o investimento pesa metade por ano
    expect(custoHora({ valor_aquisicao: 38700, prazo_retorno_meses: 24, custos_anuais: 2500, meta_utilizacao_horas: 150 })).toBe(145.67);
    // Prazo menor que um ano: o investimento inteiro no ano
    expect(custoHora({ valor_aquisicao: 1200, prazo_retorno_meses: 6, custos_anuais: 0, meta_utilizacao_horas: 100 })).toBe(12);
  });

  // Como o round($x, 2) do PHP: o Math.round em float dava 1,00 onde o AupusProject dá 1,01
  it('o meio centavo arredonda para cima, como no AupusProject', () => {
    expect(custoHora({ valor_aquisicao: 100.5, prazo_retorno_meses: 12, custos_anuais: 0, meta_utilizacao_horas: 100 })).toBe(1.01);
  });

  it('sem meta ou sem custo, nulo (nunca zero, que diria "de graça")', () => {
    expect(custoHora({ valor_aquisicao: 1000, prazo_retorno_meses: 12, custos_anuais: 0, meta_utilizacao_horas: 0 })).toBeNull();
    expect(custoHora({ valor_aquisicao: 0, prazo_retorno_meses: 12, custos_anuais: 0, meta_utilizacao_horas: 100 })).toBeNull();
  });

  it('a base fora da categoria cai no padrão dela, e os campos que não são dela saem limpos', () => {
    expect(normalizarRecurso({ categoria: 'MATERIAL', base_calculo: 'hora', funcao: 'Técnico', valor_aquisicao: 10 })).toMatchObject({
      base_calculo: 'unidade',
      rubrica: 'materiais',
      funcao: null,
      valor_aquisicao: null,
      custos_anuais: 0,
    });
    expect(normalizarRecurso({ categoria: 'MAO_DE_OBRA', base_calculo: 'diaria', rubrica: 'xyz', funcao: 'Eletricista' })).toMatchObject({
      base_calculo: 'diaria',
      rubrica: 'instrucoes',
      funcao: 'Eletricista',
    });
    expect(normalizarRecurso({ categoria: 'DESPESA_CAMPO', rubrica: 'combustivel' })).toMatchObject({ base_calculo: 'diaria', rubrica: 'combustivel' });
  });

  it('o custo apurado: o instrumento pela amortização vezes a jornada; sem ela, a diária digitada', () => {
    const instrumento = { categoria: 'INSTRUMENTO', base_calculo: 'diaria', horas_por_diaria: 8, preco_unitario: 300 };
    expect(custoApurado({ ...instrumento, valor_aquisicao: 38700, prazo_retorno_meses: 12, custos_anuais: 2500, meta_utilizacao_horas: 150 })).toEqual({
      custo_hora: 274.67,
      preco_base: 2197.36,
      custo_origem: 'amortizacao',
    });
    expect(custoApurado(instrumento)).toEqual({ custo_hora: null, preco_base: 300, custo_origem: 'diaria_do_cadastro' });
    // A mão de obra pelo preço do cadastro (o Service não tem o HH das pessoas)
    expect(custoApurado({ categoria: 'MAO_DE_OBRA', base_calculo: 'hora', preco_unitario: 85 })).toEqual({ custo_hora: null, preco_base: 85, custo_origem: 'preco_fixo' });
    expect(custoApurado({ categoria: 'MATERIAL', base_calculo: 'unidade', preco_unitario: null })).toEqual({ custo_hora: null, preco_base: null, custo_origem: null });
  });
});

describe('cadastro de recursos (banco real)', () => {
  const prisma = new PrismaService();
  const recursos = new RecursosService(prisma);
  const PREFIXO = 'TESTE-RECURSO-SN83';

  beforeEach(() => prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } }));
  afterAll(async () => {
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.$disconnect();
  });

  it('cria com a base e a rubrica da categoria e devolve o custo apurado', async () => {
    const r = await recursos.criar({
      categoria: CategoriaRecurso.INSTRUMENTO,
      nome: `${PREFIXO} Megôhmetro`,
      valor_aquisicao: 38700,
      prazo_retorno_meses: 12,
      custos_anuais: 2500,
      meta_utilizacao_horas: 150,
    });
    expect(r).toMatchObject({ base_calculo: 'diaria', rubrica: 'instrucoes', horas_por_diaria: 8, custo_hora: 274.67, preco_base: 2197.36, custo_origem: 'amortizacao' });
  });

  // Como o AupusProject (422): a base fora da categoria é recusa, não troca calada
  it('a cobrança fora da categoria é recusada, na criação e na edição', async () => {
    await expect(recursos.criar({ categoria: CategoriaRecurso.INSTRUMENTO, nome: `${PREFIXO} X`, base_calculo: 'hora' })).rejects.toBeInstanceOf(BadRequestException);
    const r = await recursos.criar({ categoria: CategoriaRecurso.MATERIAL, nome: `${PREFIXO} Y` });
    await expect(recursos.atualizar(r.id, { base_calculo: 'hora' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(recursos.atualizar(r.id, { categoria: null as never })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('trocar o instrumento para material limpa a aquisição e leva a base para a da nova; a rubrica é do recurso e fica', async () => {
    const r = await recursos.criar({ categoria: CategoriaRecurso.INSTRUMENTO, nome: `${PREFIXO} Cabo`, valor_aquisicao: 500, meta_utilizacao_horas: 10 });
    const depois = await recursos.atualizar(r.id, { categoria: CategoriaRecurso.MATERIAL, unidade: 'm', preco_unitario: 12.5 });
    expect(depois).toMatchObject({ categoria: 'MATERIAL', base_calculo: 'unidade', rubrica: 'instrucoes', valor_aquisicao: null, meta_utilizacao_horas: null, preco_base: 12.5 });
  });

  it('a base gravada fica na troca de categoria quando vale na nova; vazia na edição mantém a gravada', async () => {
    const r = await recursos.criar({ categoria: CategoriaRecurso.VEICULO, nome: `${PREFIXO} Van`, base_calculo: 'diaria', preco_unitario: 300 });
    // Célula vazia na planilha (null) não troca a cobrança nem a rubrica
    expect(await recursos.atualizar(r.id, { base_calculo: null as never, rubrica: null as never })).toMatchObject({ base_calculo: 'diaria', rubrica: 'veiculos' });
    expect(await recursos.atualizar(r.id, { categoria: CategoriaRecurso.MAO_DE_OBRA })).toMatchObject({ base_calculo: 'diaria' });
  });

  it('o nome não se repete na categoria, e "_" no nome não casa com outro (o ILIKE do Prisma casava)', async () => {
    await recursos.criar({ categoria: CategoriaRecurso.MATERIAL, nome: `${PREFIXO} Cabo_A` });
    await expect(recursos.criar({ categoria: CategoriaRecurso.MATERIAL, nome: `${PREFIXO} cabo_a` })).rejects.toBeInstanceOf(ConflictException);
    await expect(recursos.criar({ categoria: CategoriaRecurso.MATERIAL, nome: `${PREFIXO} CaboXA` })).resolves.toMatchObject({ nome: `${PREFIXO} CaboXA` });
  });

  it('a edição parcial mantém o que não veio (a função da mão de obra, a base escolhida)', async () => {
    const r = await recursos.criar({ categoria: CategoriaRecurso.MAO_DE_OBRA, nome: `${PREFIXO} Pedreiro`, funcao: 'Pedreiro', base_calculo: 'diaria', preco_unitario: 250 });
    const depois = await recursos.atualizar(r.id, { preco_unitario: 280 });
    expect(depois).toMatchObject({ funcao: 'Pedreiro', base_calculo: 'diaria', preco_base: 280 });
  });

  it('o DTO recusa a base e a rubrica fora da lista', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
    const corpo = (extra: object) => pipe.transform({ categoria: 'MATERIAL', nome: 'x', ...extra }, { type: 'body', metatype: CreateRecursoDto });
    await expect(corpo({ base_calculo: 'mes' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo({ rubrica: 'lucro' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo({ categoria: 'TECNICO' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo({ horas_por_diaria: 25 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
