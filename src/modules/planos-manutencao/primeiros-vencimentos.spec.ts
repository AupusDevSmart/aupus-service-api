import { BadRequestException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { PrevisaoDaAgendaService } from '../agenda/previsao/previsao-da-agenda.service';
import { PlanosManutencaoService } from './planos-manutencao.service';
import type { PropagacaoPlanosService } from './propagacao-planos.service';
import { ancoraDoInicio } from './primeiros-vencimentos';

/**
 * A data de início ao vincular (SN-53), contra Postgres real: ela vira a
 * âncora das tarefas da cópia, e o primeiro vencimento que a tela mostra antes
 * de confirmar é exatamente o que a previsão da agenda (e o gerador) vê depois.
 */
describe('data de início ao vincular o plano (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const service = new PlanosManutencaoService(
    prisma,
    { assertEntityInScope: async () => undefined } as unknown as PermissionScopeService,
    { enfileirar: async () => 'propagacao-de-teste' } as unknown as PropagacaoPlanosService,
  );
  const previsao = new PrevisaoDaAgendaService(prisma, escopo);

  const DIA = 86_400_000;
  const ID = (s: string) => `testeinicio${s}`.padEnd(25, '0').slice(0, 25);
  const PROPRIETARIO = ID('prop');
  const PLANTA = ID('planta');
  const UNIDADE = ID('unidade');
  const CATEGORIA = ID('categoria');
  const TIPO = ID('tipo');
  const EQUIPAMENTO = ID('equipamento');
  // UC antigo: sem unidade, com a planta na coluna própria (o gerador usa essa planta)
  const EQUIPAMENTO_ANTIGO = ID('equipantigo');
  const PREFIXO = 'TESTE-INICIO';
  let templateId = '';

  /** O dia em Brasília de daqui a `dias` (negativo = atrás), como a tela manda. */
  const diaDaqui = (dias: number) => new Date(Date.now() - 3 * 3_600_000 + dias * DIA).toISOString().slice(0, 10);

  const apagar = async () => {
    await prisma.tarefas.deleteMany({ where: { OR: [{ equipamento_id: EQUIPAMENTO }, { tag: { startsWith: PREFIXO } }] } });
    await prisma.planos_manutencao.deleteMany({ where: { OR: [{ equipamento_id: EQUIPAMENTO }, { categoria_id: CATEGORIA }] } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [EQUIPAMENTO, EQUIPAMENTO_ANTIGO] } } });
    await prisma.tipos_equipamentos.deleteMany({ where: { id: TIPO } });
    await prisma.categorias_equipamentos.deleteMany({ where: { id: CATEGORIA } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: PROPRIETARIO } });
  };

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.create({ data: { id: PROPRIETARIO, nome: 'Prop início', email: `${PROPRIETARIO}@inicio.teste` } });
    await prisma.plantas.create({
      data: {
        id: PLANTA, nome: `${PREFIXO} planta`, proprietario_id: PROPRIETARIO, cnpj: '84.100.000/0001-01', localizacao: 'x',
        horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000',
      },
    });
    await prisma.unidades.create({
      data: { id: UNIDADE, planta_id: PLANTA, nome: `${PREFIXO} usina`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 },
    });
    await prisma.categorias_equipamentos.create({ data: { id: CATEGORIA, nome: `${PREFIXO} categoria` } });
    await prisma.tipos_equipamentos.create({ data: { id: TIPO, codigo: 'TESTE_INICIO_TIPO', nome: 'Tipo início', categoria_id: CATEGORIA, fabricante: 'Teste' } });
    await prisma.equipamentos.create({
      data: { id: EQUIPAMENTO, nome: 'Inversor início', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE, tipo_equipamento_id: TIPO },
    });

    templateId = (await prisma.planos_manutencao.create({ data: { nome: `${PREFIXO} preventiva`, categoria_id: CATEGORIA } })).id;
    const tarefas: [string, string | null][] = [
      ['Troca de óleo', 'SEMESTRAL'],
      ['Limpeza', 'MENSAL'],
      ['Inspeção sem prazo', null],
    ];
    for (const [i, [nome, frequencia]] of tarefas.entries()) {
      await prisma.tarefas.create({
        data: { plano_manutencao_id: templateId, tag: `${PREFIXO}-${i}`, nome, criticidade: 3, ordem: i + 1, frequencia: frequencia as never },
      });
    }
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it('a semestral feita há 150 dias vence daqui a 30; a mensal já nasce vencida — e a previsão diz o mesmo depois de vincular', async () => {
    const inicio = diaDaqui(-150);

    const antes = await service.primeirosVencimentosDoVinculo(templateId, { data_inicio: inicio, equipamento_id: EQUIPAMENTO });
    const daTarefa = (nome: string) => antes.tarefas.find((t) => t.nome === nome)!;

    expect(antes.ancora).toEqual(new Date(`${inicio}T00:00:00.000-03:00`));
    expect(antes.com_planta).toBe(true);
    expect(daTarefa('Troca de óleo')).toMatchObject({ vence_em: new Date(antes.ancora.getTime() + 180 * DIA), atrasada: false });
    expect(daTarefa('Limpeza')).toMatchObject({ vence_em: new Date(antes.ancora.getTime() + 30 * DIA), atrasada: true });
    expect(daTarefa('Inspeção sem prazo')).toMatchObject({ vence_em: null, atrasada: false, programacao_a_partir_de: null });

    await service.vincularEquipamento({ equipamento_id: EQUIPAMENTO, plano_id: templateId, data_inicio: inicio });

    const copias = await prisma.tarefas.findMany({ where: { equipamento_id: EQUIPAMENTO, deleted_at: null }, select: { nome: true, data_ancora: true } });
    expect(copias.map((t) => t.data_ancora)).toEqual(copias.map(() => antes.ancora));

    // O que a previsão da agenda (a regra do gerador) vê para o ciclo de agora
    const { itens } = await previsao.prever({ inicio: new Date(Date.now() - 200 * DIA), fim: new Date(Date.now() + 60 * DIA), equipamentoId: EQUIPAMENTO }, undefined);
    const naPrevisao = (nome: string) => itens.find((i) => i.tarefa_nome === nome)!;
    for (const nome of ['Troca de óleo', 'Limpeza']) {
      expect(naPrevisao(nome).ciclo).toEqual(daTarefa(nome).vence_em);
    }
    expect(naPrevisao('Limpeza').situacao).toBe('atrasado');
    expect(naPrevisao('Troca de óleo')).toMatchObject({
      situacao: 'previsto',
      data_programada: daTarefa('Troca de óleo').data_programada,
      programacao_a_partir_de: daTarefa('Troca de óleo').programacao_a_partir_de,
    });
  });

  it('sem data de início (a herança, a planilha), a âncora segue sendo o instante do vínculo', async () => {
    const antes = Date.now();
    await service.vincularEquipamento({ equipamento_id: EQUIPAMENTO, plano_id: templateId });

    const copias = await prisma.tarefas.findMany({ where: { equipamento_id: EQUIPAMENTO, deleted_at: null }, select: { data_ancora: true } });
    for (const { data_ancora } of copias) {
      // TIMESTAMP(0): o segundo pode arredondar para cima ou para baixo
      expect(Math.abs(data_ancora!.getTime() - antes)).toBeLessThan(5_000);
    }
  });

  it('a planta é a mesma do gerador: o UC antigo, com a planta na coluna e sem unidade, tem planta', async () => {
    await prisma.equipamentos.create({
      data: { id: EQUIPAMENTO_ANTIGO, nome: 'Inversor antigo', classificacao: 'UC', criticidade: '3', planta_id: PLANTA, tipo_equipamento_id: TIPO },
    });

    const r = await service.primeirosVencimentosDoVinculo(templateId, { data_inicio: diaDaqui(0), equipamento_id: EQUIPAMENTO_ANTIGO });

    expect(r.com_planta).toBe(true);
    expect(r.tarefas.find((t) => t.nome === 'Troca de óleo')!.data_programada).not.toBeNull();
  });

  it('no cadastro (sem equipamento) mostra só o vencimento', async () => {
    const r = await service.primeirosVencimentosDoVinculo(templateId, { data_inicio: diaDaqui(0) });

    expect(r.com_planta).toBeNull();
    expect(r.tarefas.find((t) => t.nome === 'Troca de óleo')).toMatchObject({ data_programada: null, programacao_a_partir_de: null });
    expect(r.tarefas.find((t) => t.nome === 'Troca de óleo')!.vence_em).not.toBeNull();
  });

  describe('o que é recusado', () => {
    it.each([
      ['mais de 5 anos atrás', -6 * 366],
      ['mais de 1 ano à frente', 400],
    ])('data de início %s', async (_caso, dias) => {
      await expect(service.primeirosVencimentosDoVinculo(templateId, { data_inicio: diaDaqui(dias), equipamento_id: EQUIPAMENTO })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.vincularEquipamento({ equipamento_id: EQUIPAMENTO, plano_id: templateId, data_inicio: diaDaqui(dias) })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('dia que não existe', () => {
      expect(() => ancoraDoInicio('2026-02-31')).toThrow(BadRequestException);
    });

    it('a cópia de outro equipamento não é template: a prévia recusa como o vínculo', async () => {
      await service.vincularEquipamento({ equipamento_id: EQUIPAMENTO, plano_id: templateId });
      const copia = await prisma.planos_manutencao.findFirst({ where: { equipamento_id: EQUIPAMENTO, deleted_at: null }, select: { id: true } });

      await expect(service.primeirosVencimentosDoVinculo(copia!.id, { data_inicio: diaDaqui(0) })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
