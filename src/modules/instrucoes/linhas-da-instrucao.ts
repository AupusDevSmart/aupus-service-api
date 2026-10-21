import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { variantesDeIds } from '../tarefas/ids';
import type { CreateMaquinarioInstrucaoDto, CreateRecursoInstrucaoDto } from './dto';

type Cliente = Pick<Prisma.TransactionClient, 'recursos' | 'maquinarios' | 'instrucao_recursos' | 'instrucao_maquinarios'>;

export type LinhaDeRecursoParaGravar = Omit<Prisma.instrucao_recursosCreateManyInput, 'instrucao_id'>;
export type LinhaDeMaquinarioParaGravar = Omit<Prisma.instrucao_maquinariosCreateManyInput, 'instrucao_id'>;

const POR_TEMPO = ['hora', 'diaria'];

/** O mesmo item duas vezes seriam duas linhas somando: quem edita uma acha que corrigiu o total */
function recusarRepetido(ids: string[], nomes: Map<string, string>, oQue: string) {
  const vistos = new Set<string>();
  for (const id of ids) {
    if (vistos.has(id)) {
      throw new BadRequestException(`O ${oQue} "${nomes.get(id) ?? id}" aparece duas vezes na instrução: deixe uma linha só.`);
    }
    vistos.add(id);
  }
}

/**
 * Os itens que a lista pode citar: os do cadastro não removidos e os que a
 * instrução já tem, mesmo removidos depois (o vínculo existente vale, como na
 * planilha). Sem isso, editar qualquer outra coisa da instrução era recusado
 * por um recurso que saiu do catálogo.
 */
async function idsValidos(
  buscar: (ids: string[]) => Promise<{ id: string; nome: string; deleted_at: Date | null; base_calculo: string }[]>,
  jaVinculados: string[],
  ids: string[],
) {
  const itens = ids.length ? await buscar(variantesDeIds(ids)) : [];
  const vinculados = new Set(jaVinculados.map((id) => id.trim()));
  return new Map(itens.filter((i) => i.deleted_at === null || vinculados.has(i.id.trim())).map((i) => [i.id.trim(), i]));
}

/**
 * As linhas de recurso como o service grava (SN-85). A cobrança do recurso diz
 * quais campos valem e os outros são limpos, como a tela do AupusProject faz:
 * duração só por hora ou diária, distância só por km, perda e "fornecido pelo
 * cliente" só por unidade (o material). Quantidade vazia é 1.
 */
export async function linhasDeRecurso(
  cliente: Cliente,
  instrucaoId: string | null,
  linhas: CreateRecursoInstrucaoDto[],
): Promise<LinhaDeRecursoParaGravar[]> {
  const ids = linhas.map((l) => l.recurso_id.trim());
  const jaVinculados = instrucaoId
    ? (await cliente.instrucao_recursos.findMany({ where: { instrucao_id: { in: variantesDeIds([instrucaoId]) } }, select: { recurso_id: true } })).map((l) => l.recurso_id)
    : [];
  const validos = await idsValidos(
    (variantes) => cliente.recursos.findMany({ where: { id: { in: variantes } }, select: { id: true, nome: true, deleted_at: true, base_calculo: true } }),
    jaVinculados,
    ids,
  );

  const linhasGravadas = linhas.map((linha, indice) => {
    const recurso = validos.get(ids[indice]);
    if (!recurso) throw new BadRequestException(`O recurso da linha ${indice + 1} não existe no catálogo.`);
    const base = recurso.base_calculo;
    return {
      recurso_id: recurso.id,
      quantidade: linha.quantidade ?? 1,
      duracao_horas: POR_TEMPO.includes(base) ? (linha.duracao_horas ?? 0) : 0,
      fator_perda: base === 'unidade' ? (linha.fator_perda ?? 0) : 0,
      fornecido_pelo_cliente: base === 'unidade' ? (linha.fornecido_pelo_cliente ?? false) : false,
      distancia_km: base === 'km' ? (linha.distancia_km ?? null) : null,
      preco_proprio: linha.preco_proprio ?? null,
    };
  });
  recusarRepetido(ids, new Map([...validos].map(([id, r]) => [id, r.nome])), 'recurso');
  return linhasGravadas;
}

/** As linhas de maquinário: as mesmas regras, sem perda nem "fornecido pelo cliente" */
export async function linhasDeMaquinario(
  cliente: Cliente,
  instrucaoId: string | null,
  linhas: CreateMaquinarioInstrucaoDto[],
): Promise<LinhaDeMaquinarioParaGravar[]> {
  const ids = linhas.map((l) => l.maquinario_id.trim());
  const jaVinculados = instrucaoId
    ? (await cliente.instrucao_maquinarios.findMany({ where: { instrucao_id: instrucaoId.trim() }, select: { maquinario_id: true } })).map((l) => l.maquinario_id)
    : [];
  const validos = await idsValidos(
    (variantes) => cliente.maquinarios.findMany({ where: { id: { in: variantes } }, select: { id: true, nome: true, deleted_at: true, base_calculo: true } }),
    jaVinculados,
    ids,
  );

  const linhasGravadas = linhas.map((linha, indice) => {
    const maquinario = validos.get(ids[indice]);
    if (!maquinario) throw new BadRequestException(`O maquinário da linha ${indice + 1} não existe no cadastro.`);
    const base = maquinario.base_calculo;
    return {
      maquinario_id: maquinario.id,
      quantidade: linha.quantidade ?? 1,
      duracao_horas: POR_TEMPO.includes(base) ? (linha.duracao_horas ?? 0) : 0,
      distancia_km: base === 'km' ? (linha.distancia_km ?? null) : null,
      preco_proprio: linha.preco_proprio ?? null,
    };
  });
  recusarRepetido(ids, new Map([...validos].map(([id, m]) => [id, m.nome])), 'maquinário');
  return linhasGravadas;
}
