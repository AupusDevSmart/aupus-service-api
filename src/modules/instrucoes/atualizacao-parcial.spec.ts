import { ValidationPipe } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { ConfiguracoesDiasUteisService } from '../agenda/configuracoes-dias-uteis.service';
import { CreateConfiguracaoDiasUteisDto } from '../agenda/dto/create-configuracao-dias-uteis.dto';
import { CreateFeriadoDto } from '../agenda/dto/create-feriado.dto';
import { UpdateConfiguracaoDiasUteisDto } from '../agenda/dto/update-configuracao-dias-uteis.dto';
import { UpdateFeriadoDto } from '../agenda/dto/update-feriado.dto';
import { FeriadosService } from '../agenda/feriados.service';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';
import { PropostaService } from '../solicitacoes-servico/proposta.service';
import { CreateSolicitacaoDto } from '../solicitacoes-servico/dto/create-solicitacao.dto';
import { SolicitacoesServicoService } from '../solicitacoes-servico/solicitacoes-servico.service';
import { CreateInstrucaoDto } from './dto/create-instrucao.dto';
import { UpdateInstrucaoDto } from './dto/update-instrucao.dto';
import { InstrucoesService } from './instrucoes.service';

/**
 * PUT parcial só mexe no que veio (SN-12). O Update herdava os inicializadores
 * do Create pelo PartialType: um PUT só com o nome reativava a instrução
 * inativa e apagava as sub-instruções e os recursos; o feriado geral deixava
 * de ser geral. Mesmo pipe do main.ts, contra Postgres real.
 */
describe('PUT parcial não reseta o que não veio (banco real)', () => {
  const prisma = new PrismaService();
  const instrucoes = new InstrucoesService(prisma, {} as PropagacaoPlanosService, new PermissionScopeService(prisma));
  const feriados = new FeriadosService(prisma);
  const diasUteis = new ConfiguracoesDiasUteisService(prisma);
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
  const PREFIXO = 'TESTE-PUT-PARCIAL';

  const corpo = <T>(metatype: new () => T, dados: Record<string, unknown>) =>
    pipe.transform(dados, { type: 'body', metatype }) as Promise<T>;

  const solicitacoes = new SolicitacoesServicoService(prisma, new PermissionScopeService(prisma), {} as PropostaService);
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  let outraPlanta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const apagar = async () => {
    await prisma.instrucoes.deleteMany({ where: { codigo: { startsWith: PREFIXO } } });
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.maquinarios.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.feriado_plantas.deleteMany({ where: { feriados: { nome: { startsWith: PREFIXO } } } });
    await prisma.feriados.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.configuracao_plantas.deleteMany({ where: { configuracoes: { nome: { startsWith: PREFIXO } } } });
    await prisma.configuracoes_dias_uteis.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { titulo: { startsWith: PREFIXO } } });
  };

  beforeAll(async () => {
    await apagar();
    planta = await criarPlantaDeTeste(prisma, 'put parcial', '84.000.000/0001-01');
    outraPlanta = await criarPlantaDeTeste(prisma, 'put parcial b', '84.000.000/0001-02');
  });
  afterAll(async () => {
    await apagar();
    await planta.apagar();
    await outraPlanta.apagar();
    await prisma.$disconnect();
  });

  it('instrução: mantém status, ativo, frente, D+X, passos, recursos e maquinários', async () => {
    const pano = await prisma.recursos.create({
      data: { categoria: 'MATERIAL', base_calculo: 'unidade', rubrica: 'materiais', nome: `${PREFIXO} Pano` },
    });
    const gerador = await prisma.maquinarios.create({
      data: { nome: `${PREFIXO} Gerador`, tipo: 'proprio', base_calculo: 'diaria', rubrica: 'instrucoes' },
    });
    const { id } = await prisma.instrucoes.create({
      data: {
        codigo: PREFIXO, nome: 'Limpeza', descricao: 'x', frente: 'Civil', prazo_inicio_relativo: 3, duracao_dias: 4,
        status: 'INATIVA', ativo: false,
        sub_instrucoes: { create: [{ descricao: 'Passo 1', ordem: 1 }, { descricao: 'Passo 2', ordem: 2 }] },
        recursos: { create: [{ recurso_id: pano.id, quantidade: 3 }] },
        maquinarios: { create: [{ maquinario_id: gerador.id, duracao_horas: 8 }] },
      },
    });

    await instrucoes.atualizar(id, await corpo(UpdateInstrucaoDto, { nome: 'Limpeza geral' }));

    const depois = await prisma.instrucoes.findUniqueOrThrow({ where: { id } });
    expect(depois).toMatchObject({ nome: 'Limpeza geral', status: 'INATIVA', ativo: false, frente: 'Civil', prazo_inicio_relativo: 3, duracao_dias: 4 });
    expect(await prisma.sub_instrucoes.count({ where: { instrucao_id: id } })).toBe(2);
    expect(await prisma.instrucao_recursos.count({ where: { instrucao_id: id } })).toBe(1);
    expect(await prisma.instrucao_maquinarios.count({ where: { instrucao_id: id } })).toBe(1);
  });

  describe('criar sem os campos aplica os mesmos padrões de antes', () => {
    it('instrução nasce ATIVA, ativa, em D+0 por 1 dia e sem sub-instruções', async () => {
      const criada = await instrucoes.criar(
        await corpo(CreateInstrucaoDto, {
          codigo: `${PREFIXO}-NOVA`, nome: 'Nova', descricao: 'x',
        }),
      );

      expect(criada).toMatchObject({ status: 'ATIVA', ativo: true, prazo_inicio_relativo: 0, duracao_dias: 1, frente: null });
      expect(await prisma.sub_instrucoes.count({ where: { instrucao_id: criada.id } })).toBe(0);
    });

    it('feriado nasce não geral e não recorrente', async () => {
      const criado = await feriados.criar(
        await corpo(CreateFeriadoDto, { nome: `${PREFIXO} Aniversário`, data: '2026-10-24', tipo: 'MUNICIPAL', plantaIds: [planta.id] }),
      );

      expect(await prisma.feriados.findUniqueOrThrow({ where: { id: criado.id } })).toMatchObject({ geral: false, recorrente: false });
    });

    it('solicitação sem local grava vazio (a coluna não aceita nulo)', async () => {
      const criada = await solicitacoes.create(
        await corpo(CreateSolicitacaoDto, { titulo: `${PREFIXO} sem local`, descricao: 'x', tipo: 'INSPECAO', planta_id: planta.id }),
      );

      expect(await prisma.solicitacoes_servico.findUniqueOrThrow({ where: { id: criada.id } })).toMatchObject({ local: '' });
    });
  });

  it('feriado geral continua geral e recorrente', async () => {
    const { id } = await prisma.feriados.create({
      data: { nome: `${PREFIXO} Natal`, data: new Date('2026-12-25T00:00:00Z'), tipo: 'NACIONAL', geral: true, recorrente: true },
    });

    await feriados.atualizar(id, await corpo(UpdateFeriadoDto, { descricao: 'Natal' }));

    expect(await prisma.feriados.findUniqueOrThrow({ where: { id } })).toMatchObject({ geral: true, recorrente: true, descricao: 'Natal' });
  });

  // Sem o geral no corpo vale o gravado: antes o geral=false herdado do Create
  // fazia o PUT só com as plantas trocar os vínculos, e depois do SN-12 elas
  // eram ignoradas com 200.
  it('feriado não geral: PUT só com as plantas troca as plantas', async () => {
    const criado = await feriados.criar(
      await corpo(CreateFeriadoDto, { nome: `${PREFIXO} Padroeiro`, data: '2031-08-17', tipo: 'MUNICIPAL', plantaIds: [planta.id] }),
    );

    await feriados.atualizar(criado.id, await corpo(UpdateFeriadoDto, { plantaIds: [outraPlanta.id] }));

    const vinculos = await prisma.feriado_plantas.findMany({ where: { feriado_id: criado.id } });
    expect(vinculos.map((v) => v.planta_id.trim())).toEqual([outraPlanta.id]);
  });

  it('dias úteis não geral: PUT só com as plantas troca as plantas', async () => {
    const criada = await diasUteis.criar(
      await corpo(CreateConfiguracaoDiasUteisDto, { nome: `${PREFIXO} Escala`, sabado: true, plantaIds: [planta.id] }),
    );

    await diasUteis.atualizar(criada.id, await corpo(UpdateConfiguracaoDiasUteisDto, { plantaIds: [outraPlanta.id] }));

    const vinculos = await prisma.configuracao_plantas.findMany({ where: { configuracao_id: criada.id } });
    expect(vinculos.map((v) => v.planta_id.trim())).toEqual([outraPlanta.id]);
  });
});
