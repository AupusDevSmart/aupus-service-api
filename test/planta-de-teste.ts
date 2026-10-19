import type { PrismaService } from '../src/core';

/**
 * Uma planta (com o dono) para os specs que precisam de uma planta qualquer:
 * toda programação tem planta (SN-35), e o spec que só testa a OS não tem por
 * que montar unidade e equipamento. Cada spec usa o seu `nome` e o seu `cnpj`,
 * para não apagar a planta do outro.
 *
 * `origem()` dá uma origem de verdade à programação: toda OS tem origem
 * (SN-69), e a MANUAL que os specs usavam não existe mais. Cada chamada cria
 * uma solicitação REGISTRADA nova (programar a deixa PROGRAMADA, e uma segunda
 * programação da mesma daria 409). Espalhar no DTO: `{ ...planta.origem() }`.
 */
export async function criarPlantaDeTeste(prisma: PrismaService, nome: string, cnpj: string) {
  const idDe = (prefixo: string) => `${prefixo}${nome}`.toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(26, '0').slice(0, 26);
  const id = idDe('planta');
  const dono = idDe('dono');

  const apagar = async () => {
    await apagarSolicitacoesDeTeste(prisma, [id]);
    await prisma.plantas.deleteMany({ where: { id } });
    await prisma.usuarios.deleteMany({ where: { id: dono } });
  };

  await apagar();
  await prisma.usuarios.create({ data: { id: dono, nome: `Dono ${nome}`, email: `${dono}@planta.teste` } });
  await prisma.plantas.create({
    data: {
      id,
      nome: `Planta ${nome}`,
      cnpj,
      localizacao: 'x',
      horario_funcionamento: '08-18',
      logradouro: 'Rua',
      cidade: 'Goiânia',
      uf: 'GO',
      cep: '74000-000',
      proprietario_id: dono,
    },
  });
  return { id, apagar, origem: () => solicitacaoDeTeste(prisma, id) };
}

const PREFIXO_DA_SOLICITACAO = 'SS-TESTE-';
let solicitacoesCriadas = 0;

/**
 * Uma solicitação REGISTRADA nova na planta, como origem da programação: espalhar
 * no DTO (`{ ...(await solicitacaoDeTeste(prisma, plantaId)) }`). Quem a usa apaga
 * com `apagarSolicitacoesDeTeste` antes de apagar a planta.
 */
export async function solicitacaoDeTeste(prisma: PrismaService, plantaId: string) {
  solicitacoesCriadas += 1;
  const solicitacao = await prisma.solicitacoes_servico.create({
    data: {
      numero: `${PREFIXO_DA_SOLICITACAO}${process.pid}-${Date.now()}-${solicitacoesCriadas}`,
      titulo: `Serviço de teste ${solicitacoesCriadas}`,
      descricao: 'Origem da programação do spec',
      tipo: 'OUTRO',
      planta_id: plantaId,
      solicitante_nome: 'Solicitante do teste',
      local: 'x',
    },
    select: { id: true },
  });
  return { origem: 'SOLICITACAO_SERVICO' as const, solicitacao_servico_id: solicitacao.id };
}

/** As solicitações de teste das plantas (o histórico, os comentários e o orçamento vão em cascata). */
export async function apagarSolicitacoesDeTeste(prisma: PrismaService, plantaIds: string[]) {
  const onde = { planta_id: { in: plantaIds }, numero: { startsWith: PREFIXO_DA_SOLICITACAO } };
  const solicitacoes = await prisma.solicitacoes_servico.findMany({ where: onde, select: { id: true } });
  await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: solicitacoes.map((s) => s.id.trim()) } } });
  await prisma.solicitacoes_servico.deleteMany({ where: onde });
}
