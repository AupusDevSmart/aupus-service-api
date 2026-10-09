import { PrismaService } from './prisma.service';
import { TransacaoEmCurso, depoisDeGravar } from './transacao-em-curso';

/**
 * O desvio do PrismaService para a transação da importação — contra Postgres
 * de verdade, porque o que se prova aqui é reversão de transação, e mock não
 * reverte nada.
 *
 * É o que deixa a prévia da planilha rodar os MESMOS services do formulário e
 * desfazer tudo no fim, sem que cada service precise receber um `tx`.
 */
describe('TransacaoEmCurso (banco real)', () => {
  const prisma = new PrismaService();
  const PREFIXO = 'TESTE_TX_EM_CURSO';

  /** Abre uma transação, roda `fn` no contexto dela e desfaz tudo no fim. */
  async function dentroDeUmaTransacaoDesfeita(fn: (emCurso: TransacaoEmCurso) => Promise<void>) {
    const desfazer = new Error('desfazer');
    await prisma
      .$transaction(async (tx) => {
        const emCurso = new TransacaoEmCurso(tx);
        await emCurso.rodar(() => fn(emCurso));
        throw desfazer;
      })
      .catch((e) => {
        if (e !== desfazer) throw e;
      });
  }

  const contar = () =>
    prisma.recursos.count({ where: { nome: { startsWith: PREFIXO } } });

  beforeEach(async () => {
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  });

  afterAll(async () => {
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.$disconnect();
  });

  it('fora de uma transação em curso, grava direto', async () => {
    await prisma.recursos.create({ data: { categoria: 'TECNICO', nome: `${PREFIXO} direto` } });
    expect(await contar()).toBe(1);
  });

  it('dentro, o model vai para a transação: visto lá dentro, desfeito no fim', async () => {
    await dentroDeUmaTransacaoDesfeita(async () => {
      await prisma.recursos.create({ data: { categoria: 'TECNICO', nome: `${PREFIXO} desfeito` } });
      expect(await contar()).toBe(1);
    });

    expect(await contar()).toBe(0);
  });

  it('o $transaction de um service vira parte da transação de fora', async () => {
    await dentroDeUmaTransacaoDesfeita(async () => {
      await prisma.$transaction(async (tx) => {
        await tx.recursos.create({ data: { categoria: 'TECNICO', nome: `${PREFIXO} interna` } });
      });
      await prisma.$transaction([
        prisma.recursos.create({ data: { categoria: 'TECNICO', nome: `${PREFIXO} lista` } }),
      ]);
      expect(await contar()).toBe(2);
    });

    expect(await contar()).toBe(0);
  });

  it('SQL cru também vai para a transação', async () => {
    await dentroDeUmaTransacaoDesfeita(async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO recursos (id, categoria, nome, updated_at) VALUES ('${PREFIXO}00001', 'TECNICO', '${PREFIXO} cru', NOW())`,
      );
      expect(await contar()).toBe(1);
    });

    expect(await contar()).toBe(0);
  });

  it('quem grava fora do contexto, durante a importação, não entra nela', async () => {
    await dentroDeUmaTransacaoDesfeita(async () => {
      // Outra requisição, ao mesmo tempo: não herda o contexto da importação.
      await new Promise<void>((resolve, reject) => {
        setImmediate(() => {
          TransacaoEmCurso.fora(() =>
            prisma.recursos.create({ data: { categoria: 'TECNICO', nome: `${PREFIXO} fora` } }),
          ).then(() => resolve(), reject);
        });
      });
    });

    expect(await contar()).toBe(1);
  });

  describe('depoisDeGravar', () => {
    it('fora de uma transação em curso, roda na hora', () => {
      const efeito = jest.fn();
      depoisDeGravar(efeito);
      expect(efeito).toHaveBeenCalledTimes(1);
    });

    it('dentro, espera: só roda quando quem abriu a transação manda', async () => {
      const efeito = jest.fn();
      let emCursoGuardada: TransacaoEmCurso | null = null;

      await dentroDeUmaTransacaoDesfeita(async (emCurso) => {
        emCursoGuardada = emCurso;
        depoisDeGravar(efeito);
        expect(efeito).not.toHaveBeenCalled();
      });

      await emCursoGuardada!.executarPendentes();
      expect(efeito).toHaveBeenCalledTimes(1);
    });

    it('o que foi registrado depois de uma marca pode ser descartado', async () => {
      const mantido = jest.fn();
      const descartado = jest.fn();
      let emCursoGuardada: TransacaoEmCurso | null = null;

      await dentroDeUmaTransacaoDesfeita(async (emCurso) => {
        emCursoGuardada = emCurso;
        depoisDeGravar(mantido);
        const marca = emCurso.marca();
        depoisDeGravar(descartado);
        emCurso.descartarDesde(marca);
      });

      await emCursoGuardada!.executarPendentes();
      expect(mantido).toHaveBeenCalledTimes(1);
      expect(descartado).not.toHaveBeenCalled();
    });

    it('o efeito pendente roda fora do contexto, com o banco de verdade', async () => {
      let emCursoGuardada: TransacaoEmCurso | null = null;

      await dentroDeUmaTransacaoDesfeita(async (emCurso) => {
        emCursoGuardada = emCurso;
        depoisDeGravar(() =>
          prisma.recursos.create({ data: { categoria: 'TECNICO', nome: `${PREFIXO} depois` } }),
        );
      });

      await emCursoGuardada!.executarPendentes();
      expect(await contar()).toBe(1);
    });
  });
});
