import { PrismaService } from '@aupus/api-shared';

/**
 * A categoria de um equipamento, para casar com o template de plano.
 *
 * Duas fontes possiveis, e a ordem importa:
 *
 * 1. A POSICAO. No modelo novo a categoria pertence ao ativo funcional —
 *    "Inversor 1" e uma posicao de inversor, independente de qual inversor
 *    esteja instalado nela hoje.
 * 2. O MODELO do equipamento, pela categoria do tipo. E como funcionava antes
 *    de existir posicao.
 *
 * A posicao ganha porque e ela que define a funcao. Um equipamento instalado no
 * lugar errado nao deveria arrastar o plano do proprio modelo para uma posicao
 * de outra natureza; e a posicao que diz que servico aquele ponto da instalacao
 * precisa.
 *
 * O fallback para o modelo nao e cortesia: enquanto a migracao nao termina, a
 * maioria dos equipamentos nao tem posicao, e devolver null aqui impediria de
 * vincular plano em tudo que ainda nao migrou.
 *
 * Funcao solta, e nao metodo privado, para poder ser testada contra o banco sem
 * montar o service inteiro com todas as suas dependencias.
 */
export async function categoriaDoEquipamento(
  prisma: PrismaService,
  equipamentoId: string,
): Promise<string | null> {
  const id = equipamentoId?.trim();
  if (!id) return null;

  const equipamento = await prisma.equipamentos.findFirst({
    where: { id, deleted_at: null },
    select: {
      tipo_equipamento_id: true,
      ativo_funcional: { select: { categoria_id: true, deleted_at: true } },
    },
  });
  if (!equipamento) return null;

  const daPosicao = equipamento.ativo_funcional;
  if (daPosicao && !daPosicao.deleted_at) {
    const categoria = daPosicao.categoria_id?.trim();
    if (categoria) return categoria;
  }

  const tipoId = equipamento.tipo_equipamento_id?.trim();
  if (!tipoId) return null;

  const modelo = await prisma.tipos_equipamentos.findUnique({
    where: { id: tipoId },
    select: { categoria_id: true },
  });

  return modelo?.categoria_id?.trim() ?? null;
}
