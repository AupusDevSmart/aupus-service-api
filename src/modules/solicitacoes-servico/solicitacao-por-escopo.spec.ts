import { NotFoundException } from '@nestjs/common';
import { PermissionScopeService, PrismaService } from '@/core';
import { SolicitacoesServicoController } from './solicitacoes-servico.controller';
import { SolicitacoesServicoService } from './solicitacoes-servico.service';
import { PropostaService } from './proposta.service';

/**
 * O que pende da solicitação respeita o escopo por planta (SN-40). A proposta
 * (itens, custos, BDI), os comentários e a programação gerada eram lidos — e
 * os comentários, escritos — na solicitação de qualquer planta por quem tem
 * `solicitacoes.view`/`.create` (o técnico de campo e o cliente). E o autor do
 * comentário vinha do corpo. Pela rota de verdade (o controller), contra
 * Postgres real.
 */
describe('solicitação: proposta e comentários no escopo (banco real)', () => {
  const prisma = new PrismaService();
  const propostas = new PropostaService(prisma);
  const controller = new SolicitacoesServicoController(
    new SolicitacoesServicoService(prisma, new PermissionScopeService(prisma), propostas),
    propostas,
  );

  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testesolescopo${s}`.padEnd(25, '0').slice(0, 25);
  const DONO_A = ID('donoa');
  const DONO_B = ID('donob');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const PREFIXO = 'TESTE-SOL-ESCOPO';

  const comoCliente = { user: { id: DONO_A, role: 'proprietario' } };
  const comoTecnicoB = { user: { id: TECNICO_B, role: 'operador' } };
  let solicitacaoA: string;

  const apagar = async () => {
    await prisma.solicitacoes_servico.deleteMany({ where: { numero: { startsWith: PREFIXO } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_A, DONO_B, TECNICO_B] } } });
  };

  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });

  beforeAll(async () => {
    await apagar();
    for (const [id, nome] of [[DONO_A, 'Cliente A'], [DONO_B, 'Cliente B'], [TECNICO_B, 'Técnico B']]) {
      await prisma.usuarios.create({ data: { id, nome, email: `${id}@sol-escopo.teste` } });
    }
    await planta(PLANTA_A, DONO_A, '90.000.000/0001-01');
    await planta(PLANTA_B, DONO_B, '90.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    solicitacaoA = (
      await prisma.solicitacoes_servico.create({
        data: { numero: `${PREFIXO}-A`, titulo: `${PREFIXO} A`, descricao: 'x', tipo: 'INSPECAO', planta_id: PLANTA_A, solicitante_nome: 'x', local: 'x' },
      })
    ).id;
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  describe('GET /solicitacoes-servico/:id/proposta', () => {
    it('o cliente da planta lê; o técnico de outra planta é recusado (404)', async () => {
      await expect(controller.obterProposta(solicitacaoA, comoCliente)).resolves.toBeDefined();
      await expect(controller.obterProposta(solicitacaoA, comoTecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // Comentários (escopo, autor, interno): modules/comentarios/comentarios.spec.ts (SN-48)

  describe('GET /solicitacoes-servico/:id/programacao-os', () => {
    it('o técnico de outra planta é recusado (404)', async () => {
      await expect(controller.getProgramacaoOS(solicitacaoA, comoCliente)).resolves.toEqual({
        message: 'Esta solicitação ainda não possui uma programação de OS',
      });
      await expect(controller.getProgramacaoOS(solicitacaoA, comoTecnicoB)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
