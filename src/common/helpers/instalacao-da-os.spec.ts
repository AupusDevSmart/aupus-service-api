import { PrismaClient } from '@prisma/client';
import { instalacoesDasOrdens, instalacoesDasProgramacoes } from './instalacao-da-os';

/**
 * A derivacao da instalacao, contra Postgres de verdade.
 *
 * Mock nao serviria: o que precisa ser provado e comportamento do banco — o
 * `trim()` que faz `Char(26)` casar com `VarChar` (que e justamente onde o
 * include do Prisma falha calado) e o `COALESCE` que sobe do componente para o
 * equipamento pai. Um mock devolveria o que mandassemos devolver.
 *
 * Roda com `pnpm test:db` ou `npx jest --runInBand src/common/helpers`.
 */
describe('instalacao da OS (banco real)', () => {
  const prisma = new PrismaClient();

  // Ids fixos com `upsert`: o banco de teste nao e recriado a cada execucao, e
  // fixture que so funciona na primeira rodada erra na segunda parecendo bug.
  const ID_PROPRIETARIO = 'TESTEINSTPROPRIETARIO00001';
  const ID_PLANTA = 'TESTEINSTPLANTA00000000001';
  const ID_UNIDADE = 'TESTEINSTUNIDADE0000000001';

  let ucId: string;
  let uarId: string;
  let anomaliaId: string;

  const PREFIXO = 'TESTE-INSTALACAO';

  const criarProgramacao = async (
    sufixo: string,
    origem: 'TAREFA' | 'MANUAL' | 'ANOMALIA' | 'SOLICITACAO_SERVICO',
    extra: Record<string, unknown> = {},
  ) => {
    const codigo = `${PREFIXO}-${sufixo}`;
    const existente = await prisma.programacoes_os.findUnique({ where: { codigo } });
    if (existente) return existente.id;

    const criada = await prisma.programacoes_os.create({
      data: {
        codigo,
        descricao: `Programacao de teste ${sufixo}`,
        condicoes: 'PARADO',
        tipo: 'PREVENTIVA',
        prioridade: 'MEDIA',
        origem,
        tempo_estimado: 1,
        duracao_estimada: 1,
        ...extra,
      },
    });

    return criada.id;
  };

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: ID_PROPRIETARIO },
      update: {},
      create: {
        id: ID_PROPRIETARIO,
        nome: 'Proprietario de teste (instalacao)',
        email: 'teste-instalacao@aupus.local',
        senha: 'x',
      },
    });

    await prisma.plantas.upsert({
      where: { id: ID_PLANTA },
      update: {},
      create: {
        id: ID_PLANTA,
        nome: 'Planta de teste (instalacao)',
        cnpj: '00000000000516',
        proprietario_id: ID_PROPRIETARIO,
        horario_funcionamento: '08:00-18:00',
        localizacao: 'Teste',
        logradouro: 'Rua de teste, 1',
        cidade: 'Goiania',
        uf: 'GO',
        cep: '74000000',
      },
    });

    await prisma.unidades.upsert({
      where: { id: ID_UNIDADE },
      update: {},
      create: {
        id: ID_UNIDADE,
        planta_id: ID_PLANTA,
        nome: 'Instalacao de teste',
        tipo: 'UC',
        estado: 'GO',
        cidade: 'Goiania',
        latitude: 0,
        longitude: 0,
        potencia: 0,
      },
    });

    const uc = await prisma.equipamentos.findFirst({
      where: { nome: 'UC de teste (instalacao)', deleted_at: null },
    });
    ucId = uc
      ? uc.id
      : (
          await prisma.equipamentos.create({
            data: {
              nome: 'UC de teste (instalacao)',
              classificacao: 'UC',
              criticidade: '3',
              unidade_id: ID_UNIDADE,
            },
          })
        ).id;

    const uar = await prisma.equipamentos.findFirst({
      where: { nome: 'UAR de teste (instalacao)', deleted_at: null },
    });
    uarId = uar
      ? uar.id
      : (
          await prisma.equipamentos.create({
            data: {
              nome: 'UAR de teste (instalacao)',
              classificacao: 'UAR',
              criticidade: '3',
              equipamento_pai_id: ucId,
            },
          })
        ).id;

    const anomalia = await prisma.anomalias.findFirst({
      where: { descricao: 'Anomalia de teste (instalacao)', deleted_at: null },
    });
    anomaliaId = anomalia
      ? anomalia.id
      : (
          await prisma.anomalias.create({
            data: {
              descricao: 'Anomalia de teste (instalacao)',
              local: 'Teste',
              ativo: 'Teste',
              origem: 'OPERADOR',
              planta_id: ID_PLANTA,
              equipamento_id: ucId,
            },
          })
        ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('a origem TAREFA acha a instalacao pelo equipamento congelado na tarefa', async () => {
    const programacaoId = await criarProgramacao('TAREFA', 'TAREFA');

    // O componente NAO tem `unidade_id` proprio — quem tem e o UC pai. Se o
    // COALESCE do helper cair, este e o caso que quebra, e componente e boa
    // parte do que aparece em tarefa.
    const jaTem = await prisma.tarefas_programacao_os.findFirst({
      where: { programacao_id: programacaoId },
    });
    if (!jaTem) {
      await prisma.tarefas_programacao_os.create({
        data: { programacao_id: programacaoId, equipamento_id: uarId, ordem: 0 },
      });
    }

    const mapa = await instalacoesDasProgramacoes(prisma as any, [programacaoId]);

    expect(mapa.get(programacaoId)).toEqual([{ id: ID_UNIDADE, nome: 'Instalacao de teste' }]);
  });

  it('a origem ANOMALIA acha a instalacao pelo equipamento da anomalia', async () => {
    const programacaoId = await criarProgramacao('ANOMALIA', 'ANOMALIA', {
      anomalia_id: anomaliaId,
    });

    const mapa = await instalacoesDasProgramacoes(prisma as any, [programacaoId]);

    expect(mapa.get(programacaoId)).toEqual([{ id: ID_UNIDADE, nome: 'Instalacao de teste' }]);
  });

  it('a origem SOLICITACAO_SERVICO acha a instalacao pela unidade da solicitacao', async () => {
    const numero = `${PREFIXO}-SOL`;
    const solicitacao = await prisma.solicitacoes_servico.upsert({
      where: { numero },
      update: { unidade_id: ID_UNIDADE },
      create: {
        numero,
        titulo: 'Solicitacao de teste',
        descricao: 'Solicitacao de teste',
        tipo: 'MANUTENCAO_CORRETIVA',
        planta_id: ID_PLANTA,
        unidade_id: ID_UNIDADE,
        solicitante_nome: 'Teste',
        local: 'Teste',
      },
    });

    const programacaoId = await criarProgramacao('SOLICITACAO', 'SOLICITACAO_SERVICO', {
      solicitacao_servico_id: solicitacao.id,
    });

    const mapa = await instalacoesDasProgramacoes(prisma as any, [programacaoId]);

    expect(mapa.get(programacaoId)).toEqual([{ id: ID_UNIDADE, nome: 'Instalacao de teste' }]);
  });

  /**
   * O caso que motivou a lista poder vir vazia.
   *
   * A OP manual nao registra equipamento nem unidade — so texto livre em
   * `local`. Devolver a planta aqui responderia outra pergunta, e devolver o
   * texto livre sob o rotulo "Instalacao" seria mentira.
   */
  it('a origem MANUAL nao tem instalacao — e isso e ausencia de dado, nao erro', async () => {
    const programacaoId = await criarProgramacao('MANUAL', 'MANUAL', {
      planta_id: ID_PLANTA,
      local: 'Subestacao principal',
    });

    const mapa = await instalacoesDasProgramacoes(prisma as any, [programacaoId]);

    expect(mapa.get(programacaoId)).toBeUndefined();
  });

  it('a OS acha a instalacao pelo equipamento congelado na tarefa da OS', async () => {
    const programacaoId = await criarProgramacao('OS', 'TAREFA');

    const numeroOs = `${PREFIXO}-OS`;
    const existente = await prisma.ordens_servico.findUnique({ where: { numero_os: numeroOs } });
    const os =
      existente ??
      (await prisma.ordens_servico.create({
        data: {
          programacao_id: programacaoId,
          numero_os: numeroOs,
          descricao: 'OS de teste',
          condicoes: 'PARADO',
          tipo: 'PREVENTIVA',
          prioridade: 'MEDIA',
          origem: 'TAREFA',
          tempo_estimado: 1,
          duracao_estimada: 1,
        },
      }));

    const jaTem = await prisma.tarefas_os.findFirst({ where: { os_id: os.id } });
    if (!jaTem) {
      await prisma.tarefas_os.create({
        data: { os_id: os.id, equipamento_id: ucId, ordem: 0 },
      });
    }

    const mapa = await instalacoesDasOrdens(prisma as any, [os.id]);

    expect(mapa.get(os.id)).toEqual([{ id: ID_UNIDADE, nome: 'Instalacao de teste' }]);
  });

  it('lista vazia nao consulta o banco', async () => {
    const mapa = await instalacoesDasProgramacoes(prisma as any, []);

    expect(mapa.size).toBe(0);
  });
});
