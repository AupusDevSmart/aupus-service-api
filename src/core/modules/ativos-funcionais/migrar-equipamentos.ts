import { PrismaService } from '../../prisma/prisma.service';

export interface RelatorioDaMigracao {
  migrados: number;
  ignorados: {
    nao_e_uc: number;
    sem_instalacao: number;
    sem_categoria: number;
    ja_migrado: number;
  };
  detalhes: Array<{ id: string; nome: string; motivo: string }>;
}

interface OpcoesDaMigracao {
  /** Conta o que faria sem gravar nada. Serve para conferir antes de valer. */
  simular?: boolean;
}

/**
 * Transforma cada equipamento existente numa POSICAO com ele instalado.
 *
 * Roda uma vez por ambiente. Sobem para a posicao os quatro campos que passam a
 * ser dela — nome, categoria, instalacao e localizacao; o resto fica no
 * equipamento, e nenhuma chave estrangeira muda: as 19 tabelas que apontam para
 * `equipamentos.id` continuam apontando para a mesma linha.
 *
 * Tres criterios de exclusao, e nenhum e arbitrario:
 *
 * - **So UC.** UAR e peca de um equipamento, nao posicao da instalacao — um
 *   barramento nao e um lugar onde se instala coisa. Continuam como filhos.
 * - **Precisa de instalacao.** `ativos_funcionais.unidade_id` e NOT NULL:
 *   posicao sem instalacao nao existe por definicao.
 * - **Precisa de tipo.** A categoria da posicao sai da categoria do tipo do
 *   equipamento. Sem tipo nao ha de onde tirar, e inventar uma categoria
 *   "Não classificado" deixaria lixo permanente no sistema por causa de poucos
 *   registros.
 *
 * O que fica de fora vem nomeado no relatorio, com o motivo. Migracao que
 * silencia exclusao vira descoberta ruim seis meses depois.
 */
export async function migrarEquipamentosParaPosicoes(
  prisma: PrismaService,
  opcoes: OpcoesDaMigracao = {},
): Promise<RelatorioDaMigracao> {
  const equipamentos = await prisma.equipamentos.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      nome: true,
      classificacao: true,
      unidade_id: true,
      tipo_equipamento_id: true,
      ativo_funcional_id: true,
      localizacao: true,
      localizacao_especifica: true,
    },
    orderBy: { nome: 'asc' },
  });

  const relatorio: RelatorioDaMigracao = {
    migrados: 0,
    ignorados: { nao_e_uc: 0, sem_instalacao: 0, sem_categoria: 0, ja_migrado: 0 },
    detalhes: [],
  };

  const excluir = (eq: { id: string; nome: string }, chave: keyof RelatorioDaMigracao['ignorados'], motivo: string) => {
    relatorio.ignorados[chave]++;
    relatorio.detalhes.push({ id: eq.id.trim(), nome: eq.nome, motivo });
  };

  // A categoria de cada tipo, de uma vez: consultar por equipamento faria uma
  // ida ao banco por linha, e a migracao roda sobre centenas.
  const tipos = await prisma.tipos_equipamentos.findMany({
    select: { id: true, categoria_id: true },
  });
  const categoriaDoTipo = new Map(tipos.map(t => [t.id.trim(), t.categoria_id.trim()]));

  for (const eq of equipamentos) {
    if (eq.ativo_funcional_id) {
      excluir(eq, 'ja_migrado', 'ja tem posicao');
      continue;
    }
    if (eq.classificacao !== 'UC') {
      excluir(eq, 'nao_e_uc', `classificacao ${eq.classificacao}: e peca ou dado sem instalacao`);
      continue;
    }
    if (!eq.unidade_id) {
      excluir(eq, 'sem_instalacao', 'sem instalacao — posicao exige uma');
      continue;
    }

    const categoriaId = eq.tipo_equipamento_id
      ? categoriaDoTipo.get(eq.tipo_equipamento_id.trim())
      : undefined;

    if (!categoriaId) {
      excluir(eq, 'sem_categoria', 'sem tipo definido — nao ha categoria para a posicao');
      continue;
    }

    relatorio.migrados++;
    if (opcoes.simular) continue;

    // Posicao, vinculo e equipamento numa transacao so: um equipamento com
    // `ativo_funcional_id` apontando para posicao sem vinculo aberto seria um
    // estado que nenhuma tela sabe ler.
    await prisma.$transaction(async (tx) => {
      const posicao = await tx.ativos_funcionais.create({
        data: {
          nome: eq.nome,
          categoria_id: categoriaId,
          unidade_id: eq.unidade_id!.trim(),
          localizacao: eq.localizacao,
          localizacao_especifica: eq.localizacao_especifica,
        },
      });

      await tx.ativos_funcionais_equipamentos.create({
        data: { ativo_funcional_id: posicao.id, equipamento_id: eq.id },
      });

      await tx.equipamentos.update({
        where: { id: eq.id },
        data: { ativo_funcional_id: posicao.id, ativo_na_posicao: true },
      });
    });
  }

  return relatorio;
}
