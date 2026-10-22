import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { reais } from './custo-da-os';
import { naturezaDoItem, ROTULO_DA_NATUREZA, type NaturezaDoOutroCusto } from './natureza-do-custo';

/**
 * Os outros custos da OS — instrumento, maquinário, veículo, terceiro, despesa
 * de campo — conferidos no Executar (SN-93, D2): o que estava no orçamento vem
 * com o valor previsto preenchido para confirmar ou corrigir, e o que não estava
 * se lança ali, com descrição. Até o SN-93 eles ficavam só no orçamento e o custo
 * real da OS era só mão de obra e material (na OSP-2026-0145, R$ 3.856,64 de fora).
 *
 * O pedido é a lista inteira, como a tela a mostra:
 * - o previsto recebe só o valor real (0 = não houve); não sai da OS, porque é
 *   registro do que foi planejado; o que não vem fica como estava;
 * - o não previsto que já existe (com id) troca descrição, natureza e valor; o que
 *   não vem sai (lançado por engano);
 * - o sem id é um não previsto novo, com descrição.
 */
export interface OutroCustoPedido {
  id?: string;
  descricao?: string;
  natureza?: NaturezaDoOutroCusto;
  valor_real: number;
}

const emReais = (v: Prisma.Decimal | number | null) => (v === null ? '—' : `R$ ${reais(new Prisma.Decimal(v))}`);

/** Grava os outros custos e devolve o que mudou, para a trilha (null se nada mudou) */
export async function gravarOutrosCustos(
  tx: Pick<Prisma.TransactionClient, 'itens_orcamento_os'>,
  osId: string,
  pedidos: OutroCustoPedido[],
): Promise<string | null> {
  // O mesmo item duas vezes gravava duas, e a segunda trilha dizia "de" um valor que já não era o gravado
  const ids = pedidos.map((p) => p.id?.trim()).filter((id): id is string => !!id);
  if (new Set(ids).size !== ids.length) throw new BadRequestException('O mesmo outro custo veio duas vezes na lista: recarregue a tela.');

  const atuais = await tx.itens_orcamento_os.findMany({ where: { os_id: osId } });
  const porId = new Map(atuais.map((i) => [i.id.trim(), i]));
  const mudancas: string[] = [];
  const mantidos = new Set<string>();

  for (const [indice, pedido] of pedidos.entries()) {
    const id = pedido.id?.trim();
    if (id) {
      const item = porId.get(id);
      // O id de outra OS "não existe" aqui, como qualquer id fora do escopo
      if (!item) throw new NotFoundException('Um dos outros custos não pertence a esta OS: recarregue a tela.');
      mantidos.add(id);
      const descricao = item.nao_previsto ? pedido.descricao?.trim() || item.descricao : item.descricao;
      const natureza = item.nao_previsto ? (pedido.natureza ?? naturezaDoItem(item.natureza)) : item.natureza;
      const valorMudou = item.valor_real === null || !item.valor_real.equals(pedido.valor_real);
      if (!valorMudou && descricao === item.descricao && natureza === item.natureza) continue;
      await tx.itens_orcamento_os.update({ where: { id: item.id }, data: { valor_real: pedido.valor_real, descricao, natureza } });
      const novo = emReais(pedido.valor_real);
      if (item.nao_previsto) mudancas.push(`não previsto ${descricao}: ${emReais(item.valor_real)} para ${novo}`);
      else if (item.valor_real === null) mudancas.push(`${descricao}: previsto ${emReais(item.valor)}, conferido ${novo}`);
      else mudancas.push(`${descricao}: ${emReais(item.valor_real)} para ${novo}`);
      continue;
    }

    const descricao = pedido.descricao?.trim();
    if (!descricao) throw new BadRequestException(`O custo não previsto ${indice + 1} da lista precisa de descrição.`);
    const natureza = pedido.natureza ?? 'OUTRO';
    await tx.itens_orcamento_os.create({
      data: { os_id: osId, descricao, natureza, valor: 0, valor_real: pedido.valor_real, nao_previsto: true },
    });
    mudancas.push(`não previsto ${descricao} (${ROTULO_DA_NATUREZA[natureza]}): ${emReais(pedido.valor_real)}`);
  }

  // O não previsto que não veio sai: era a lista inteira
  const sairam = atuais.filter((i) => i.nao_previsto && !mantidos.has(i.id.trim()));
  if (sairam.length) {
    await tx.itens_orcamento_os.deleteMany({ where: { os_id: osId, id: { in: sairam.map((i) => i.id) } } });
    mudancas.push(...sairam.map((i) => `não previsto ${i.descricao} (${emReais(i.valor_real)}) retirado`));
  }

  return mudancas.length ? `Outros custos: ${mudancas.join('; ')}.` : null;
}
