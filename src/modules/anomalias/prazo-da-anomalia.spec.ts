import { PermissionScopeService, PrismaService } from '@/core';
import { AnomaliasService } from './anomalias.service';
import { CondicaoAnomalia, OrigemAnomalia, PrioridadeAnomalia } from './dto/create-anomalia.dto';

/**
 * O prazo da anomalia é um instante com fuso (SN-74). A tela mostrava o campo
 * e nunca o mandava (nenhuma anomalia do dev tinha prazo); o DTO aceitava
 * "2027-01-15", que o Prisma recusa (500). Aqui: o instante em Brasília grava
 * o mesmo instante, e null apaga. Contra Postgres real.
 */
describe('prazo da anomalia (banco real)', () => {
  const prisma = new PrismaService();
  const service = new AnomaliasService(prisma, new PermissionScopeService(prisma));

  const ID = (s: string) => `testeprazoanom${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const PLANTA = ID('planta');
  const UNIDADE = ID('unidade');
  const UC = ID('uc');
  const PREFIXO = 'TESTE-PRAZO-ANOMALIA';
  const admin = { id: DONO, role: 'admin' };

  const apagar = async () => {
    const anomalias = await prisma.anomalias.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } });
    // O evento "anomalia registrada" (SN-47): entidade_id é gravado aparado, o id da anomalia vem com espaço
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: anomalias.map((a) => a.id.trim()) } } });
    await prisma.historico_anomalias.deleteMany({ where: { anomalia_id: { in: anomalias.map((a) => a.id) } } });
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: UC } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
  };

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.create({ data: { id: DONO, nome: 'Dono', email: `${DONO}@prazo-anomalia.teste` } });
    await prisma.plantas.create({
      data: { id: PLANTA, nome: `${PREFIXO} planta`, cnpj: '74.000.000/0001-02', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
    await prisma.unidades.create({ data: { id: UNIDADE, planta_id: PLANTA, nome: `${PREFIXO} unidade`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it('grava o instante do fuso informado e apaga com null', async () => {
    const criada = await service.create(
      {
        descricao: `${PREFIXO} vazamento`,
        localizacao: { equipamentoId: UC, local: 'Casa de máquinas', ativo: 'Inversor' },
        condicao: CondicaoAnomalia.FUNCIONANDO,
        origem: OrigemAnomalia.OPERADOR,
        prioridade: PrioridadeAnomalia.ALTA,
        prazo: '2026-10-20T18:00:00-03:00',
      },
      admin,
    );
    const gravada = await prisma.anomalias.findUniqueOrThrow({ where: { id: criada.id }, select: { prazo: true } });
    expect(gravada.prazo?.toISOString()).toBe('2026-10-20T21:00:00.000Z');

    await service.update(criada.id, { prazo: null }, admin);
    const apagada = await prisma.anomalias.findUniqueOrThrow({ where: { id: criada.id }, select: { prazo: true } });
    expect(apagada.prazo).toBeNull();
  });
});
