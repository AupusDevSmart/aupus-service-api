import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { exceptionFactoryEmPortugues } from '../../common/pipes/mensagens-validacao';
import { MaquinariosService } from '../maquinarios/maquinarios.service';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';
import { variantesDeIds } from '../tarefas/ids';
import { CreateInstrucaoDto } from './dto/create-instrucao.dto';
import { UpdateInstrucaoDto } from './dto/update-instrucao.dto';
import { InstrucoesService } from './instrucoes.service';

/**
 * A instrução com as tabelas e os campos do AupusProject (SN-85): código,
 * frente e D+X; o passo com disciplina e duração em horas; as linhas de recurso
 * com duração, perda, "fornecido pelo cliente", km e preço próprio; e o
 * maquinário. O mesmo pipe do configurar-app, contra Postgres real.
 */
describe('instrução como no AupusProject (banco real)', () => {
  const prisma = new PrismaService();
  const instrucoes = new InstrucoesService(prisma, {} as PropagacaoPlanosService, new PermissionScopeService(prisma));
  const maquinariosService = new MaquinariosService(prisma);
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: exceptionFactoryEmPortugues,
  });
  const PREFIXO = 'TESTE-SN85';
  const AUTOR = 'TESTESN85AUTORDAINSTRUCAO';
  let eletricista: string;
  let cabo: string;
  let carro: string;
  let semPreco: string;
  let munck: string;

  const corpo = <T>(metatype: new () => T, dados: Record<string, unknown>) =>
    pipe.transform(dados, { type: 'body', metatype }) as Promise<T>;

  const frases = async (dados: Record<string, unknown>) => {
    try {
      await corpo(CreateInstrucaoDto, { nome: `${PREFIXO} recusada`, ...dados });
    } catch (erro) {
      expect(erro).toBeInstanceOf(BadRequestException);
      return ((erro as BadRequestException).getResponse() as { message: string[] }).message.join(' | ');
    }
    throw new Error('o pipe aceitou');
  };

  const apagar = async () => {
    const ids = (await prisma.instrucoes.findMany({ where: { nome: { startsWith: PREFIXO } }, select: { id: true } })).map((i) => i.id);
    await prisma.instrucao_recursos.deleteMany({ where: { instrucao_id: { in: variantesDeIds(ids) } } });
    await prisma.instrucao_maquinarios.deleteMany({ where: { instrucao_id: { in: ids } } });
    await prisma.instrucoes.deleteMany({ where: { id: { in: ids } } });
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.maquinarios.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  };

  const criarRecurso = async (dados: Record<string, unknown>) =>
    (await prisma.recursos.create({ data: { nome: `${PREFIXO} ?`, categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', ...dados } as never })).id.trim();

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.upsert({
      where: { id: AUTOR },
      update: {},
      create: { id: AUTOR, nome: 'Autor SN-85', email: 'autor.sn85@instrucao.teste' },
    });
    eletricista = await criarRecurso({ nome: `${PREFIXO} Eletricista`, preco_unitario: 80 });
    cabo = await criarRecurso({ nome: `${PREFIXO} Cabo`, categoria: 'MATERIAL', base_calculo: 'unidade', rubrica: 'materiais', unidade: 'm', preco_unitario: 12.5 });
    carro = await criarRecurso({ nome: `${PREFIXO} Carro`, categoria: 'VEICULO', base_calculo: 'km', rubrica: 'veiculos', preco_unitario: 2 });
    semPreco = await criarRecurso({ nome: `${PREFIXO} Sem preço`, categoria: 'TERCEIRO', base_calculo: 'fechado', rubrica: 'terceirizados' });
    munck = (
      await prisma.maquinarios.create({
        data: { nome: `${PREFIXO} Munck`, tipo: 'locacao', base_calculo: 'diaria', rubrica: 'terceirizados', preco_unitario: 1500 },
      })
    ).id.trim();
  });
  afterAll(async () => {
    await apagar();
    await prisma.usuarios.deleteMany({ where: { id: AUTOR } });
    await prisma.$disconnect();
  });

  it('cria com o cabeçalho de lá, passos com disciplina e horas, e o custo aberto por grupo', async () => {
    const dto = await corpo(CreateInstrucaoDto, {
      nome: `${PREFIXO} Troca de cabo`,
      frente: '  Elétrica ',
      prazo_inicio_relativo: 5,
      duracao_dias: 2,
      sub_instrucoes: [
        { descricao: 'Desenergizar', tipo: 'eletrico', duracao_horas: 0.5, obrigatoria: true },
        { descricao: 'Lançar o cabo', tipo: 'civil', duracao_horas: 2.25 },
      ],
      recursos: [
        { recurso_id: eletricista, quantidade: 2, duracao_horas: 3 },
        { recurso_id: cabo, quantidade: 40, fator_perda: 0.1 },
        { recurso_id: carro, distancia_km: 120 },
      ],
      maquinarios: [{ maquinario_id: munck, duracao_horas: 10 }],
    });

    const criada = await instrucoes.criar(dto);

    expect(criada.codigo).toMatch(/^INST-\d{3,}$/);
    expect(criada).toMatchObject({ frente: 'Elétrica', prazo_inicio_relativo: 5, duracao_dias: 2, descricao: null, horas_dos_passos: 2.75 });
    expect(criada.sub_instrucoes!.map((p) => [p.descricao, p.tipo, p.duracao_horas, p.registro])).toEqual([
      ['Desenergizar', 'eletrico', 0.5, 'VERIFICACAO'],
      ['Lançar o cabo', 'civil', 2.25, 'VERIFICACAO'],
    ]);
    // 2 x 3 h x 80 = 480; 40 m + 10% = 44 x 12,50 = 550; 120 km x 2 = 240; munck 10 h = 2 diárias x 1.500 = 3.000
    expect(criada.recursos!.map((l) => [l.recurso.nome, l.unidades, l.subtotal])).toEqual([
      [`${PREFIXO} Cabo`, 44, 550],
      [`${PREFIXO} Carro`, 120, 240],
      [`${PREFIXO} Eletricista`, 3, 480],
    ]);
    expect(criada.maquinarios!.map((l) => [l.maquinario.nome, l.unidades, l.subtotal])).toEqual([[`${PREFIXO} Munck`, 2, 3000]]);
    expect(criada.custo_por_grupo).toEqual({ recursos: 720, maquinario: 3000, materiais: 550 });
    expect(criada.custo).toBe(4270);
  });

  // O detalhe se lê com manutencao.view (técnico, cliente); o cadastro do item pede recursos.manage
  it('a linha traz o item resumido com o preço, sem o investimento nem os custos anuais do cadastro', async () => {
    const mego = await criarRecurso({
      nome: `${PREFIXO} Megômetro`,
      categoria: 'INSTRUMENTO',
      base_calculo: 'diaria',
      valor_aquisicao: 38700,
      prazo_retorno_meses: 12,
      custos_anuais: 2500,
      meta_utilizacao_horas: 150,
    });
    const criada = await instrucoes.criar(
      await corpo(CreateInstrucaoDto, { nome: `${PREFIXO} Ensaio`, recursos: [{ recurso_id: mego, duracao_horas: 2 }], maquinarios: [{ maquinario_id: munck }] }),
    );

    const [linha] = criada.recursos!;
    expect(linha.recurso).toMatchObject({ id: mego, nome: `${PREFIXO} Megômetro`, base_calculo: 'diaria', preco_base: 2197.36, custo_origem: 'amortizacao' });
    expect(linha.recurso).not.toHaveProperty('valor_aquisicao');
    expect(linha.recurso).not.toHaveProperty('custos_anuais');
    expect(linha.recurso).not.toHaveProperty('custo_hora');
    expect(criada.maquinarios![0].maquinario).not.toHaveProperty('valor_aquisicao');
  });

  // Pelo corpo, quem gravava escolhia em nome de quem (como nas associações, SN-40)
  it('o autor é quem está logado (o controller passa o do token), nunca o corpo', async () => {
    const criada = await instrucoes.criar(await corpo(CreateInstrucaoDto, { nome: `${PREFIXO} Autoria` }), AUTOR);
    await instrucoes.atualizar(criada.id, await corpo(UpdateInstrucaoDto, { duracao_dias: 2 }), AUTOR);

    const gravada = await prisma.instrucoes.findUniqueOrThrow({ where: { id: criada.id } });
    expect([gravada.criado_por?.trim(), gravada.atualizado_por?.trim()]).toEqual([AUTOR, AUTOR]);
    expect(await frases({ criado_por: AUTOR })).toContain('O campo "autor" não é aceito aqui');
  });

  it('o campo que a cobrança não usa sai limpo: duração no material, distância na hora, perda no veículo', async () => {
    const criada = await instrucoes.criar(
      await corpo(CreateInstrucaoDto, {
        nome: `${PREFIXO} Limpeza`,
        recursos: [
          { recurso_id: cabo, quantidade: 5, duracao_horas: 9 },
          { recurso_id: eletricista, duracao_horas: 1, distancia_km: 30, fator_perda: 0.5, fornecido_pelo_cliente: true },
        ],
      }),
    );

    const porNome = new Map(criada.recursos!.map((l) => [l.recurso.nome, l]));
    expect(porNome.get(`${PREFIXO} Cabo`)).toMatchObject({ quantidade: 5, duracao_horas: 0 });
    expect(porNome.get(`${PREFIXO} Eletricista`)).toMatchObject({
      quantidade: 1,
      duracao_horas: 1,
      distancia_km: null,
      fator_perda: 0,
      fornecido_pelo_cliente: false,
      subtotal: 80,
    });
  });

  it('linha sem preço deixa o total e o grupo dela nulos (nunca zero)', async () => {
    const criada = await instrucoes.criar(
      await corpo(CreateInstrucaoDto, { nome: `${PREFIXO} Terceiro`, recursos: [{ recurso_id: semPreco }, { recurso_id: cabo, quantidade: 1 }] }),
    );

    expect(criada.custo).toBeNull();
    expect(criada.custo_por_grupo).toEqual({ recursos: null, maquinario: 0, materiais: 12.5 });
  });

  it('o mesmo recurso duas vezes é 400, não duas linhas somando', async () => {
    await expect(
      instrucoes.criar(
        await corpo(CreateInstrucaoDto, {
          nome: `${PREFIXO} Repetida`,
          recursos: [{ recurso_id: eletricista, duracao_horas: 1 }, { recurso_id: `${eletricista}  ` }],
        }),
      ),
    ).rejects.toThrow(`O recurso "${PREFIXO} Eletricista" aparece duas vezes na instrução`);
  });

  it('o recurso removido do catálogo que a instrução já usa continua valendo; numa instrução nova, não', async () => {
    const antigo = await criarRecurso({ nome: `${PREFIXO} Antigo`, preco_unitario: 10 });
    const criada = await instrucoes.criar(await corpo(CreateInstrucaoDto, { nome: `${PREFIXO} Com antigo`, recursos: [{ recurso_id: antigo, duracao_horas: 1 }] }));
    await prisma.recursos.update({ where: { id: antigo }, data: { deleted_at: new Date() } });

    const editada = await instrucoes.atualizar(
      criada.id,
      await corpo(UpdateInstrucaoDto, { nome: `${PREFIXO} Com antigo editada`, recursos: [{ recurso_id: antigo, duracao_horas: 2 }] }),
    );
    expect(editada.recursos!.map((l) => [l.recurso_id, l.duracao_horas])).toEqual([[antigo, 2]]);

    await expect(
      instrucoes.criar(await corpo(CreateInstrucaoDto, { nome: `${PREFIXO} Nova com antigo`, recursos: [{ recurso_id: antigo }] })),
    ).rejects.toThrow('O recurso da linha 1 não existe no catálogo');
  });

  // O índice único vale para todas: conferir só as vivas deixava passar e o banco dava 500
  it('o código de uma instrução removida é recusado com 409, e não com o 500 do banco', async () => {
    const removida = await instrucoes.criar(await corpo(CreateInstrucaoDto, { codigo: `${PREFIXO}-COD`, nome: `${PREFIXO} Removida` }));
    await instrucoes.remover(removida.id);

    const repetir = instrucoes.criar(await corpo(CreateInstrucaoDto, { codigo: `${PREFIXO}-COD`, nome: `${PREFIXO} Outra` }));
    await expect(repetir).rejects.toBeInstanceOf(ConflictException);
    await expect(instrucoes.criar(await corpo(CreateInstrucaoDto, { codigo: `${PREFIXO}-COD`, nome: `${PREFIXO} Outra` }))).rejects.toThrow(
      'é de uma instrução removida',
    );
  });

  // O PartialType deixa o null passar (IsOptional); na coluna NOT NULL o Prisma dava 500
  it('null nos campos obrigatórios do PUT mantém o gravado, não dá 500', async () => {
    const criada = await instrucoes.criar(await corpo(CreateInstrucaoDto, { nome: `${PREFIXO} Nula`, prazo_inicio_relativo: 4, duracao_dias: 2 }));

    const editada = await instrucoes.atualizar(
      criada.id,
      await corpo(UpdateInstrucaoDto, { nome: null, prazo_inicio_relativo: null, duracao_dias: null, descricao: 'nova' }),
    );

    expect(editada).toMatchObject({ nome: `${PREFIXO} Nula`, prazo_inicio_relativo: 4, duracao_dias: 2, descricao: 'nova' });
  });

  it('o código vazio na edição mantém o gravado', async () => {
    const criada = await instrucoes.criar(await corpo(CreateInstrucaoDto, { codigo: `${PREFIXO}-FICA`, nome: `${PREFIXO} Fica` }));

    const editada = await instrucoes.atualizar(criada.id, await corpo(UpdateInstrucaoDto, { codigo: '  ', duracao_dias: 3 }));

    expect(editada).toMatchObject({ codigo: `${PREFIXO}-FICA`, duracao_dias: 3 });
  });

  it('remover o maquinário em uso é recusado; desativar é o caminho', async () => {
    const gerador = (await prisma.maquinarios.create({ data: { nome: `${PREFIXO} Gerador`, tipo: 'proprio', base_calculo: 'diaria', rubrica: 'instrucoes' } })).id.trim();
    await instrucoes.criar(await corpo(CreateInstrucaoDto, { nome: `${PREFIXO} Com gerador`, maquinarios: [{ maquinario_id: gerador }] }));

    await expect(maquinariosService.remover(gerador)).rejects.toThrow('Este maquinário está em uso em 1 instrução');
  });

  it('as frentes já usadas, sem repetir, para o formulário sugerir', async () => {
    const frentes = await instrucoes.frentes();
    expect(frentes.filter((f) => f === 'Elétrica')).toHaveLength(1);
  });

  it.each([
    [{ sub_instrucoes: [{ descricao: 'x', tipo: 'hidraulico' }] }, 'A disciplina do passo é administrativo, civil, eletrico ou mecanico'],
    [{ sub_instrucoes: [{ descricao: 'x', duracao_horas: -1 }] }, 'duração em horas não pode ser negativo'],
    [{ duracao_dias: 0 }, 'duração em dias deve ser no mínimo 1'],
    [{ prazo_inicio_relativo: -2 }, 'início (D+X) não pode ser negativo'],
    [{ recursos: [{ recurso_id: 'x', fator_perda: 1.5 }] }, 'perda deve ser no máximo 1'],
    [{ recursos: [{ recurso_id: 'x', preco_proprio: -1 }] }, 'preço próprio não pode ser negativo'],
    [{ recursos: [{ quantidade: 1 }] }, 'Informe recurso.'],
    [{ maquinarios: [{ maquinario_id: '' }] }, 'Informe maquinário.'],
    // O campo que saiu não passa mais (forbidNonWhitelisted): o front antigo recebe a recusa, não um silêncio
    [{ categoria: 'ELETRICA' }, 'categoria'],
    [{ tag: 'INST-001' }, 'tag'],
  ])('recusa %j', async (dados, frase) => {
    expect(await frases(dados)).toContain(frase);
  });
});
