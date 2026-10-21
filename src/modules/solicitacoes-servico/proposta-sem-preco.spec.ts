import { PrismaService } from '@/core';
import { PropostaService } from './proposta.service';
import { criarPlantaDeTeste, solicitacaoDeTeste } from '../../../test/planta-de-teste';

/**
 * A sugestão de valor da proposta é o custo da instrução, e a linha sem preço
 * no cadastro entra como zero (é sugestão; a pessoa ajusta). Sem dizer quais
 * instruções têm linha assim, o valor parecia completo e a proposta saía
 * abaixo do custo (pendência do SN-85, resolvida no SN-86).
 *
 * Roda com `npx jest --runInBand src/modules/solicitacoes-servico/proposta-sem-preco`.
 */
describe('proposta: instrução com linha sem preço (banco real)', () => {
  const prisma = new PrismaService();
  const propostas = new PropostaService(prisma);
  const PREFIXO = 'TESTE-PROPOSTA-SEM-PRECO';
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const apagar = async () => {
    await prisma.instrucoes.deleteMany({ where: { codigo: { startsWith: PREFIXO } } });
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  };

  beforeAll(async () => {
    await apagar();
    planta = await criarPlantaDeTeste(prisma, 'propostasempreco', '95.000.000/0001-87');
  });
  afterAll(async () => {
    await planta.apagar();
    await apagar();
    await prisma.$disconnect();
  });

  const recurso = (nome: string, preco: number | null) =>
    prisma.recursos.create({
      data: { nome: `${PREFIXO} ${nome}`, categoria: 'MATERIAL', base_calculo: 'unidade', rubrica: 'materiais', preco_unitario: preco },
    });
  const instrucao = async (codigo: string, linhas: Array<{ recurso_id: string; quantidade: number }>) => {
    const criada = await prisma.instrucoes.create({ data: { codigo: `${PREFIXO}-${codigo}`, nome: `Instrução ${codigo}`, descricao: 'x' } });
    for (const linha of linhas) await prisma.instrucao_recursos.create({ data: { instrucao_id: criada.id, ...linha } });
    return criada.id.trim();
  };

  it('a sugestão soma só o que tem preço, e a leitura diz qual instrução tem linha sem preço', async () => {
    const cabo = await recurso('Cabo', 5);
    const conector = await recurso('Conector', null);
    const comFuro = await instrucao('A', [
      { recurso_id: cabo.id, quantidade: 10 },
      { recurso_id: conector.id, quantidade: 4 },
    ]);
    const completa = await instrucao('B', [{ recurso_id: cabo.id, quantidade: 2 }]);

    const { solicitacao_servico_id: id } = await solicitacaoDeTeste(prisma, planta.id);
    await prisma.solicitacoes_instrucoes.createMany({
      data: [
        { solicitacao_id: id, instrucao_id: comFuro, ordem: 1 },
        { solicitacao_id: id, instrucao_id: completa, ordem: 2 },
      ],
    });
    await propostas.materializarDeInstrucoes(id);

    const proposta = await propostas.obter(id);
    expect(proposta.itens.map((i) => [i.instrucao_id?.trim(), Number(i.preco_unitario)])).toEqual([
      [comFuro, 50],
      [completa, 10],
    ]);
    expect(proposta.instrucoes_sem_preco).toEqual([comFuro]);
  });
});
