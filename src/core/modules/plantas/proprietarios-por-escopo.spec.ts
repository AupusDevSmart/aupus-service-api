import { PrismaService } from '../../prisma/prisma.service';
import { PermissionScopeService } from '../auth/permission-scope.service';
import { PlantasService } from './plantas.service';

/**
 * `GET /plantas/proprietarios` no escopo de quem pede (SN-40). A rota pede só
 * `plantas.view` — que o técnico de campo e o cliente têm — e devolvia nome e
 * CPF/CNPJ de todos os clientes, gerentes e administradores (LGPD). Agora quem
 * tem escopo recebe só os donos das plantas do escopo: o cliente, ele mesmo; o
 * técnico, os das plantas em que atua. Contra Postgres real.
 */
describe('donos de planta no escopo de quem pede (banco real)', () => {
  const prisma = new PrismaService();
  const plantas = new PlantasService(prisma, new PermissionScopeService(prisma));

  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testedonosescopo${s}`.padEnd(25, '0').slice(0, 25);
  const DONO_A = ID('donoa');
  const DONO_B = ID('donob');
  const TECNICO_B = ID('tecnicob');
  const SEM_PLANTA = ID('semplanta');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const PREFIXO = 'TESTE-DONOS-ESCOPO';

  const apagar = async () => {
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_A, DONO_B, TECNICO_B, SEM_PLANTA] } } });
  };

  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });

  beforeAll(async () => {
    await apagar();
    for (const [id, role, cpf] of [
      [DONO_A, 'proprietario', '111.111.111-11'],
      [DONO_B, 'proprietario', '222.222.222-22'],
      [TECNICO_B, 'operador', null],
      [SEM_PLANTA, 'operador', null],
    ]) {
      await prisma.usuarios.create({ data: { id, nome: `${PREFIXO} ${id}`, email: `${id}@donos-escopo.teste`, role, cpf_cnpj: cpf } });
    }
    await planta(PLANTA_A, DONO_A, '86.000.000/0001-01');
    await planta(PLANTA_B, DONO_B, '86.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  const donos = async (user?: { id: string; role: string }) =>
    (await plantas.findProprietarios(false, user)).map((d) => d.id.trim()).sort();

  it('o cliente recebe só ele mesmo (antes recebia todos, com CPF/CNPJ)', async () => {
    expect(await donos({ id: DONO_A, role: 'proprietario' })).toEqual([DONO_A]);
  });

  it('o técnico recebe só os donos das plantas em que atua', async () => {
    expect(await donos({ id: TECNICO_B, role: 'operador' })).toEqual([DONO_B]);
  });

  it('o técnico sem planta não recebe ninguém', async () => {
    expect(await donos({ id: SEM_PLANTA, role: 'operador' })).toEqual([]);
  });

  it('com "só quem tem unidade", o escopo continua valendo', async () => {
    expect(await plantas.findProprietarios(true, { id: DONO_A, role: 'proprietario' })).toEqual([]);
  });

  it('quem vê todas as plantas (o formulário de planta) recebe todos, com o CPF/CNPJ', async () => {
    const todos = await plantas.findProprietarios(false, { id: TECNICO_B, role: 'analista' });
    const doTeste = todos.filter((d) => [DONO_A, DONO_B].includes(d.id.trim()));
    expect(doTeste.map((d) => [d.id.trim(), d.cpf_cnpj]).sort()).toEqual([
      [DONO_A, '111.111.111-11'],
      [DONO_B, '222.222.222-22'],
    ]);
  });
});
