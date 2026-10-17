import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { exceptionFactoryEmPortugues } from '../../common/pipes/mensagens-validacao';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';
import { CreateInstrucaoDto } from './dto/create-instrucao.dto';
import { UpdateInstrucaoDto } from './dto/update-instrucao.dto';
import { InstrucoesService } from './instrucoes.service';

/**
 * O passo de leitura da instrução (SN-58): unidade e faixa só na leitura, o
 * mínimo até o máximo, e a faixa volta em número (o Decimal viraria texto no
 * JSON). O mesmo pipe do configurar-app, contra Postgres real.
 */
describe('passo de leitura na instrução (banco real)', () => {
  const prisma = new PrismaService();
  const instrucoes = new InstrucoesService(prisma, {} as PropagacaoPlanosService, new PermissionScopeService(prisma));
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: exceptionFactoryEmPortugues,
  });
  const PREFIXO = 'TESTE-PASSO-LEITURA';

  const corpo = <T>(metatype: new () => T, dados: Record<string, unknown>) =>
    pipe.transform(dados, { type: 'body', metatype }) as Promise<T>;

  const instrucao = (passos: Array<Record<string, unknown>>) => ({
    tag: `${PREFIXO}-1`,
    nome: 'Medição',
    descricao: 'Teste',
    categoria: 'ELETRICA',
    tipo_manutencao: 'PREVENTIVA',
    condicao_ativo: 'FUNCIONANDO',
    criticidade: 3,
    duracao_estimada: 1,
    tempo_estimado: 30,
    sub_instrucoes: passos,
  });

  /** As frases do 400, como o usuário recebe. */
  const recusa = async (passos: Array<Record<string, unknown>>) => {
    try {
      await corpo(CreateInstrucaoDto, instrucao(passos));
    } catch (erro) {
      expect(erro).toBeInstanceOf(BadRequestException);
      return ((erro as BadRequestException).getResponse() as { message: string[] }).message;
    }
    throw new Error('o pipe aceitou');
  };

  const apagar = () => prisma.instrucoes.deleteMany({ where: { tag: { startsWith: PREFIXO } } });
  beforeAll(apagar);
  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it.each([
    [{ descricao: 'Inspecionar', unidade: 'V' }, 'Unidade e faixa são só do passo de leitura'],
    [{ descricao: 'Inspecionar', tipo: 'VERIFICACAO', valor_maximo: 10 }, 'Unidade e faixa são só do passo de leitura'],
    [{ descricao: 'Tensão', tipo: 'LEITURA', valor_minimo: 30, valor_maximo: 20 }, 'O mínimo da faixa passa do máximo'],
    [{ descricao: 'Tensão', tipo: 'MEDICAO' }, 'O tipo do passo é VERIFICACAO ou LEITURA'],
    [{ descricao: 'Tensão', tipo: 'LEITURA', valor_maximo: 1.23456 }, 'máximo da faixa aceita no máximo 4 casas decimais'],
    [{ descricao: 'Tensão', tipo: 'LEITURA', valor_minimo: 1e-7 }, 'mínimo da faixa aceita no máximo 4 casas decimais'],
    [{ descricao: 'Tensão', tipo: 'LEITURA', unidade: 'quilovolt-ampere reativo' }, 'unidade'],
  ])('recusa o passo %j', async (passo, frase) => {
    expect((await recusa([passo])).join(' | ')).toContain(frase);
  });

  it('aceita leitura com faixa inteira, só mínimo, só máximo ou sem faixa; tipo vazio é verificação', async () => {
    const dto = await corpo(
      CreateInstrucaoDto,
      instrucao([
        { descricao: 'Tensão', tipo: 'LEITURA', unidade: ' V ', valor_minimo: 580, valor_maximo: 620 },
        { descricao: 'Isolação', tipo: 'LEITURA', unidade: 'MΩ', valor_minimo: 1 },
        { descricao: 'Temperatura', tipo: 'LEITURA', unidade: '°C', valor_maximo: 70.5 },
        { descricao: 'Horímetro', tipo: 'LEITURA' },
        { descricao: 'Limpar o painel' },
      ]),
    );

    const criada = await instrucoes.criar(dto);
    const lida = await instrucoes.buscarPorId(criada.id);

    expect(
      lida.sub_instrucoes!.map((p) => [p.descricao, p.tipo, p.unidade, p.valor_minimo, p.valor_maximo]),
    ).toEqual([
      ['Tensão', 'LEITURA', 'V', 580, 620],
      ['Isolação', 'LEITURA', 'MΩ', 1, null],
      ['Temperatura', 'LEITURA', '°C', null, 70.5],
      ['Horímetro', 'LEITURA', null, null, null],
      ['Limpar o painel', 'VERIFICACAO', null, null, null],
    ]);
  });

  it('trocar a leitura por verificação na edição tira a unidade e a faixa', async () => {
    const atual = (await prisma.instrucoes.findFirstOrThrow({ where: { tag: `${PREFIXO}-1` } })).id;

    await instrucoes.atualizar(atual, await corpo(UpdateInstrucaoDto, { sub_instrucoes: [{ descricao: 'Tensão', tipo: 'VERIFICACAO' }] }));

    const passos = await prisma.sub_instrucoes.findMany({ where: { instrucao_id: atual } });
    expect(passos.map((p) => [p.tipo, p.unidade, p.valor_minimo, p.valor_maximo])).toEqual([['VERIFICACAO', null, null, null]]);
  });
});
