import { PermissionScopeService, PrismaService } from '@/core';
import { AnomaliasService } from '../anomalias/anomalias.service';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';

/**
 * Nenhuma resposta leva o hash da senha. Anomalias e solicitações incluíam a
 * linha inteira do usuário (autor, solicitante, proprietário), com o campo
 * `senha`, em GET/POST/PATCH — achado no SN-36. Contra Postgres real.
 */
describe('a senha não sai nas respostas de anomalia e solicitação (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const anomalias = new AnomaliasService(prisma, escopo);
  const solicitacoes = new SolicitacoesServicoService(prisma, escopo, new PropostaService(prisma));

  const PREFIXO = 'TESTE-SEM-SENHA';
  const AUTOR = 'testesemsenhaautor00000000';
  const HASH = '$2b$10$hashquenuncapodesairnaresposta00000000000000000000000';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;
  let anomaliaId: string;
  let solicitacaoId: string;

  const limpar = async () => {
    await prisma.anomalias.deleteMany({ where: { descricao: { startsWith: PREFIXO } } });
    await prisma.solicitacoes_servico.deleteMany({ where: { titulo: { startsWith: PREFIXO } } });
  };

  beforeAll(async () => {
    await limpar();
    await prisma.usuarios.deleteMany({ where: { id: AUTOR } });
    planta = await criarPlantaDeTeste(prisma, 'semsenha', '95.000.000/0001-05');
    await prisma.usuarios.create({ data: { id: AUTOR, nome: 'Autor sem senha', email: 'autor@sem-senha.teste', senha: HASH } });

    anomaliaId = (
      await prisma.anomalias.create({
        data: { descricao: `${PREFIXO} vazamento`, local: 'Usina', ativo: 'Inversor', origem: 'OPERADOR', usuario_id: AUTOR, planta_id: planta.id },
      })
    ).id;
    solicitacaoId = (
      await prisma.solicitacoes_servico.create({
        data: {
          numero: `${PREFIXO}-1`,
          titulo: `${PREFIXO} troca`,
          descricao: 'x',
          tipo: 'INSPECAO',
          planta_id: planta.id,
          solicitante_nome: 'Autor sem senha',
          local: 'Usina',
          solicitante_id: AUTOR,
          proprietario_id: AUTOR,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await limpar();
    await prisma.usuarios.deleteMany({ where: { id: AUTOR } });
    await planta.apagar();
    await prisma.$disconnect();
  });

  const semSenha = (resposta: unknown) => {
    const json = JSON.stringify(resposta);
    expect(json).not.toContain(HASH);
    expect(json).not.toMatch(/"senha"/);
  };

  it('anomalia: lista e detalhe trazem o autor sem a senha', async () => {
    const detalhe = await anomalias.findOne(anomaliaId);
    expect(JSON.stringify(detalhe)).toContain('Autor sem senha');
    semSenha(detalhe);
    semSenha(await anomalias.findAll({ page: 1, limit: 100, search: PREFIXO } as never));
  });

  it('solicitação: lista e detalhe trazem solicitante e proprietário sem a senha', async () => {
    const detalhe = await solicitacoes.findOne(solicitacaoId);
    expect(JSON.stringify(detalhe)).toContain('Autor sem senha');
    semSenha(detalhe);
    semSenha(await solicitacoes.findAll({ page: 1, limit: 100, search: PREFIXO } as never));
  });
});
