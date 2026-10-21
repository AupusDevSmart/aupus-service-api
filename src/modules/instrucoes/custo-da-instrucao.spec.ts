import { Prisma, type maquinarios, type recursos } from '@prisma/client';
import { linhaDoMaquinario, linhaDoRecurso, porGrupo, somar, subtotalDaBase, unidadesDaBase } from './custo-da-instrucao';

/**
 * A conta da linha da instrução, a do AupusProject (BaseDeCusto +
 * CustoInstrucaoService, SN-85). Os números são os dos casos de lá.
 */
const recurso = (extra: Partial<recursos>): recursos => ({
  id: 'r1                        ',
  categoria: 'MAO_DE_OBRA',
  nome: 'Eletricista',
  funcao: null,
  descricao: null,
  unidade: null,
  base_calculo: 'hora',
  rubrica: 'instrucoes',
  preco_unitario: new Prisma.Decimal(80),
  valor_aquisicao: null,
  prazo_retorno_meses: null,
  custos_anuais: new Prisma.Decimal(0),
  meta_utilizacao_horas: null,
  horas_por_diaria: 8,
  ativo: true,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
  ...extra,
});

const maquinario = (extra: Partial<maquinarios>): maquinarios => ({
  id: 'm1                        ',
  nome: 'Munck',
  tipo: 'locacao',
  descricao: null,
  base_calculo: 'diaria',
  rubrica: 'terceirizados',
  preco_unitario: new Prisma.Decimal(1500),
  valor_aquisicao: null,
  prazo_retorno_meses: null,
  custos_anuais: new Prisma.Decimal(0),
  meta_utilizacao_horas: null,
  horas_por_diaria: 8,
  ativo: true,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
  ...extra,
});

const linha = (extra: Record<string, unknown> = {}) => ({
  quantidade: new Prisma.Decimal(1),
  duracao_horas: new Prisma.Decimal(0),
  fator_perda: new Prisma.Decimal(0),
  fornecido_pelo_cliente: false,
  distancia_km: null,
  preco_proprio: null,
  ...extra,
});

const dados = (extra: Partial<Parameters<typeof unidadesDaBase>[1]> = {}) => ({
  quantidade: 1,
  duracao_horas: 0,
  fator_perda: 0,
  distancia_km: null,
  horas_por_diaria: 8,
  ...extra,
});

describe('unidades da base', () => {
  it('hora: as horas da linha', () => {
    expect(unidadesDaBase('hora', dados({ duracao_horas: 3 }))).toBe(3);
  });

  it('diária: horas ÷ jornada, sempre para cima; zero hora é zero diária', () => {
    expect(unidadesDaBase('diaria', dados({ duracao_horas: 2 }))).toBe(1);
    expect(unidadesDaBase('diaria', dados({ duracao_horas: 10 }))).toBe(2);
    expect(unidadesDaBase('diaria', dados({ duracao_horas: 16 }))).toBe(2);
    expect(unidadesDaBase('diaria', dados({ duracao_horas: 0 }))).toBe(0);
    expect(unidadesDaBase('diaria', dados({ duracao_horas: 10, horas_por_diaria: 12 }))).toBe(1);
  });

  it('unidade: a perda entra na quantidade (40 m com 10% são 44 m comprados)', () => {
    expect(unidadesDaBase('unidade', dados({ quantidade: 40, fator_perda: 0.1 }))).toBe(44);
  });

  it('km: a distância; fechado: 1', () => {
    expect(unidadesDaBase('km', dados({ distancia_km: 120 }))).toBe(120);
    expect(unidadesDaBase('km', dados())).toBe(0);
    expect(unidadesDaBase('fechado', dados({ quantidade: 3 }))).toBe(1);
  });
});

describe('subtotal', () => {
  it('a quantidade multiplica, menos na base por unidade (onde já está dentro)', () => {
    expect(subtotalDaBase('hora', dados({ quantidade: 2, duracao_horas: 3 }), 3, 80)).toBe(480);
    expect(subtotalDaBase('unidade', dados({ quantidade: 40, fator_perda: 0.1 }), 44, 12.5)).toBe(550);
    expect(subtotalDaBase('fechado', dados({ quantidade: 3 }), 1, 1000)).toBe(3000);
  });

  it('sem preço é nulo, nunca zero', () => {
    expect(subtotalDaBase('hora', dados({ duracao_horas: 3 }), 3, null)).toBeNull();
  });

  it('o meio centavo arredonda para cima, como o round() do PHP', () => {
    expect(subtotalDaBase('hora', dados({ duracao_horas: 0.5 }), 0.5, 20.01)).toBe(10.01);
  });
});

describe('a linha da instrução', () => {
  it('mão de obra: 2 eletricistas por 3 h a R$ 80 = R$ 480, no grupo de recursos', () => {
    const l = linhaDoRecurso({ ...linha({ quantidade: 2, duracao_horas: 3 }), recurso: recurso({}) });
    expect(l).toMatchObject({ grupo: 'recursos', recurso_id: 'r1', base_calculo: 'hora', unidades: 3, preco_base: 80, subtotal: 480 });
  });

  it('material vai para o grupo de materiais; fornecido pelo cliente custa zero mesmo sem preço', () => {
    const cabo = recurso({ categoria: 'MATERIAL', base_calculo: 'unidade', rubrica: 'materiais', preco_unitario: null });
    const doCliente = linhaDoRecurso({ ...linha({ quantidade: 40, fornecido_pelo_cliente: true }), recurso: cabo });
    expect(doCliente).toMatchObject({ grupo: 'materiais', subtotal: 0 });
    expect(linhaDoRecurso({ ...linha({ quantidade: 40 }), recurso: cabo }).subtotal).toBeNull();
  });

  it('o preço próprio vale só na linha; o do cadastro vai junto para a tela', () => {
    const l = linhaDoRecurso({ ...linha({ duracao_horas: 2, preco_proprio: new Prisma.Decimal(100) }), recurso: recurso({}) });
    expect(l).toMatchObject({ preco_base: 100, preco_cadastro: 80, preco_proprio: 100, subtotal: 200 });
  });

  it('instrumento por diária pela amortização: 10 h = 2 diárias do custo apurado', () => {
    const mego = recurso({
      categoria: 'INSTRUMENTO',
      base_calculo: 'diaria',
      preco_unitario: null,
      valor_aquisicao: new Prisma.Decimal(38700),
      prazo_retorno_meses: 12,
      custos_anuais: new Prisma.Decimal(2500),
      meta_utilizacao_horas: new Prisma.Decimal(150),
    });
    // 274,67/h x 8 h = 2.197,36 a diária
    expect(linhaDoRecurso({ ...linha({ duracao_horas: 10 }), recurso: mego })).toMatchObject({ unidades: 2, preco_base: 2197.36, subtotal: 4394.72 });
  });

  it('maquinário: munck alugado por diária, 10 h = 2 diárias', () => {
    const l = linhaDoMaquinario({ ...linha({ duracao_horas: 10 }), maquinario: maquinario({}) });
    expect(l).toMatchObject({ origem: 'maquinario', grupo: 'maquinario', maquinario_id: 'm1', unidades: 2, subtotal: 3000 });
  });

  it('maquinário por km: a distância vezes a quantidade', () => {
    const l = linhaDoMaquinario({ ...linha({ quantidade: 2, distancia_km: new Prisma.Decimal(50) }), maquinario: maquinario({ base_calculo: 'km', preco_unitario: new Prisma.Decimal(4) }) });
    expect(l.subtotal).toBe(400);
  });
});

describe('o total e os grupos', () => {
  it('uma linha sem custo deixa o total nulo, e só o grupo dela', () => {
    const linhas = [
      { grupo: 'recursos' as const, subtotal: 480 },
      { grupo: 'materiais' as const, subtotal: null },
    ];
    expect(somar(linhas)).toBeNull();
    expect(porGrupo(linhas)).toEqual({ recursos: 480, maquinario: 0, materiais: null });
  });

  it('grupo sem linha é zero, não nulo', () => {
    expect(porGrupo([])).toEqual({ recursos: 0, maquinario: 0, materiais: 0 });
    expect(somar([{ subtotal: 0.1 }, { subtotal: 0.2 }])).toBe(0.3);
  });
});
