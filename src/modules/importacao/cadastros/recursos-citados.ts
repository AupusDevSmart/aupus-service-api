import { BadRequestException } from '@nestjs/common';
import type { PrismaService, recursos } from '@/core';
import { RecursosService } from '@/modules/recursos/recursos.service';
import { CreateRecursoDto, UpdateRecursoDto } from '@/modules/recursos/dto/recurso.dto';
import { custoApurado } from '@/modules/recursos/regras-do-recurso';
import { validarComoOFormulario } from '../importacao.service';
import type { ItemDeCatalogo, RecursoDaPlanilha, UsuarioDaImportacao } from '../importacao.types';
import { chave } from '../catalogo-por-nome';

export const ROTULO_DA_BASE: Record<string, string> = {
  hora: 'por hora',
  diaria: 'por diária',
  unidade: 'por unidade',
  km: 'por km',
  fechado: 'valor fechado',
};

const ROTULO_DA_CATEGORIA: Record<string, string> = {
  MAO_DE_OBRA: 'Mão de obra',
  MATERIAL: 'Material',
  INSTRUMENTO: 'Instrumento',
  VEICULO: 'Veículo',
  TERCEIRO: 'Terceiro',
  DESPESA_CAMPO: 'Despesa de campo',
};

// O toLocaleString separa "R$" com espaço não separável: na frase, espaço comum
const moeda = (v: number | null) =>
  v === null ? 'sem preço' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const mesmoPreco = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 0.005);
const descrever = (c: Pick<RecursoDaPlanilha, 'base_calculo' | 'preco'>) =>
  [c.base_calculo && (ROTULO_DA_BASE[c.base_calculo] ?? c.base_calculo), c.preco !== null && moeda(c.preco)].filter(Boolean).join(', ');

/**
 * Os recursos que a planilha de instruções cita, para o motor gravar antes das
 * instruções (SN-98, decisão do usuário de 23/out/2026). Até ali, recurso que não
 * existia era erro na linha, e preço diferente do cadastro era ignorado: quem
 * montava a planilha (às vezes uma IA) tinha de conferir e acertar o cadastro à
 * mão antes de importar.
 *
 * - Não existe: cria, com a categoria da aba REFERÊNCIAS e a cobrança e o preço
 *   das linhas da instrução. Sem categoria na REFERÊNCIAS é erro: não há de onde
 *   tirá-la. Criar pede o mesmo que o "+" do formulário da instrução (a
 *   permissão da importação de instruções).
 * - Existe com cobrança ou preço diferente: atualiza o CADASTRO (vale para todas
 *   as instruções e para as propostas novas; as OS e propostas que já existem
 *   guardam o valor delas). Mudar preço é da tela de Recursos: sem
 *   `recursos.manage`, avisa e o cadastro fica.
 * - O instrumento cujo custo vem da amortização (valor de aquisição) não muda
 *   pelo preço unitário: avisa, e o cadastro fica.
 *
 * Quem é o recurso, como a instrução resolve a linha (`resolverRecursos`):
 * material casa entre os materiais e o resto entre os que não são material; o
 * ID DO ITEM desempata o nome repetido (o cadastro aceita o mesmo nome em
 * categorias diferentes), e o removido que a linha aponta vale como está. Com
 * o nome trocado para outro que existe, vale o nome (a regra da planilha). O ID
 * de um recurso que hoje tem OUTRO nome só é erro quando o nome não existe: aí a
 * importação criaria um duplicado calado (o recurso renomeado depois da
 * exportação).
 */
export function itensDosRecursosCitados(
  prisma: PrismaService,
  servico: RecursosService,
  citados: RecursoDaPlanilha[],
  usuario: UsuarioDaImportacao,
): ItemDeCatalogo[] {
  // O catálogo é lido uma vez (dentro da transação) e acompanha o que cada item grava
  let catalogo: recursos[] | null = null;
  const lerCatalogo = async () => (catalogo ??= await prisma.recursos.findMany());
  // A que recurso cada item chegou: dois itens no mesmo recurso com valores diferentes é erro
  const resolvidos = new Map<string, RecursoDaPlanilha>();

  const vistos = new Set<string>();
  const unicos = citados.filter((c) => {
    const k = `${c.grupo}|${chave(c.nome)}|${c.id?.trim() ?? ''}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  return unicos.map((citado) => ({
    aba: citado.aba,
    linha: citado.linha,
    campo: 'recursos',
    rotulo: `${citado.grupo === 'materiais' ? 'Material' : 'Recurso'} "${citado.nome}"`,
    gravar: async () => {
      const todos = await lerCatalogo();
      const alvo = quemE(todos, citado);
      if (alvo === 'removido') return null;

      // Outro item já chegou a este recurso: valores diferentes são erro; o que só um diz vale (o atualizar aplica o que falta)
      const antes = alvo ? resolvidos.get(alvo.id.trim()) : undefined;
      if (antes) {
        const outraBase = antes.base_calculo && citado.base_calculo && antes.base_calculo !== citado.base_calculo;
        const outroPreco = antes.preco !== null && citado.preco !== null && !mesmoPreco(antes.preco, citado.preco);
        if (outraBase || outroPreco) {
          throw new BadRequestException(
            `é o mesmo recurso da aba ${antes.aba}, linha ${antes.linha} ("${antes.nome}"), e aqui está ${descrever(citado)}, lá ${descrever(antes)}. A importação acerta o cadastro pela planilha: deixe a COBRANÇA e o VALOR DO CADASTRO iguais.`,
          );
        }
      }

      const feito = alvo ? await atualizar(servico, alvo, citado, usuario) : await criar(servico, citado);
      const id = alvo?.id ?? feito.criado!.id;
      resolvidos.set(
        id.trim(),
        antes ? { ...antes, base_calculo: antes.base_calculo ?? citado.base_calculo, preco: antes.preco ?? citado.preco } : citado,
      );
      if (feito.criado) todos.push(feito.criado);
      if (feito.depois) todos.splice(todos.indexOf(alvo!), 1, feito.depois);
      return feito.resultado;
    },
  }));
}

/** O recurso do cadastro que a linha cita, ou `null` se não existe (é para criar) */
function quemE(todos: recursos[], citado: RecursoDaPlanilha): recursos | 'removido' | null {
  const doGrupo = todos.filter((r) => (r.categoria === 'MATERIAL') === (citado.grupo === 'materiais'));
  const peloId = citado.id ? doGrupo.find((r) => r.id.trim() === citado.id!.trim()) : undefined;

  if (peloId && chave(peloId.nome) === chave(citado.nome)) {
    // O removido que a instrução ainda usa: a importação da instrução o aceita, e aqui ele fica como está
    return peloId.deleted_at ? 'removido' : peloId;
  }

  // O ID não é deste nome (ou não há ID): vale o nome, como na instrução
  const pelosNomes = doGrupo.filter((r) => !r.deleted_at && chave(r.nome) === chave(citado.nome));
  if (pelosNomes.length > 1) {
    throw new BadRequestException(
      `há ${pelosNomes.length} com esse nome no cadastro de recursos, e a linha não traz o ID DO ITEM de um deles. Preencha o ID DO ITEM (está na aba REFERÊNCIAS) ou renomeie um deles.`,
    );
  }
  if (pelosNomes.length === 1) return pelosNomes[0];

  // Seria criado: com o ID de um recurso vivo de outro nome, é o renomeado depois da exportação
  if (peloId && !peloId.deleted_at) {
    throw new BadRequestException(
      `não existe, e o ID DO ITEM desta linha é do recurso "${peloId.nome}" (renomeado depois da exportação?). Para usar esse, escreva "${peloId.nome}" em ITEM; para cadastrar um recurso novo com este nome, apague o ID DO ITEM.`,
    );
  }
  return null;
}

type Feito = {
  resultado: Awaited<ReturnType<ItemDeCatalogo['gravar']>>;
  criado?: recursos;
  depois?: recursos;
};

async function criar(servico: RecursosService, citado: RecursoDaPlanilha): Promise<Feito> {
  // O que a REFERÊNCIAS diz e o front não reconheceu só pesa aqui: é a única hora em que ela conta
  if (citado.problemas.length > 0) {
    throw new BadRequestException(`não existe no cadastro, e a aba REFERÊNCIAS não dá para ler: ${citado.problemas.join(' ')}`);
  }
  const categoria = citado.grupo === 'materiais' ? 'MATERIAL' : citado.categoria;
  if (!categoria) {
    throw new BadRequestException(
      'não existe no cadastro, e a aba REFERÊNCIAS não diz a categoria dele. Inclua o recurso na REFERÊNCIAS, com a CATEGORIA, ou cadastre-o antes.',
    );
  }
  const dados: Record<string, unknown> = {
    nome: citado.nome,
    categoria,
    ...(citado.base_calculo && { base_calculo: citado.base_calculo }),
    ...(citado.preco !== null && { preco_unitario: citado.preco }),
    ...(categoria === 'MATERIAL' && citado.unidade && { unidade: citado.unidade }),
  };
  const dto = (await validarComoOFormulario(CreateRecursoDto, dados)) as CreateRecursoDto;
  const criado = await servico.criar(dto);
  return {
    criado,
    resultado: {
      feito: {
        cadastro: 'recurso',
        acao: 'novo',
        nome: citado.nome,
        detalhe: [ROTULO_DA_CATEGORIA[categoria] ?? categoria, ROTULO_DA_BASE[criado.base_calculo] ?? criado.base_calculo, moeda(citado.preco)].join(', '),
      },
    },
  };
}

async function atualizar(servico: RecursosService, atual: recursos, citado: RecursoDaPlanilha, usuario: UsuarioDaImportacao): Promise<Feito> {
  const mudancas: Record<string, unknown> = {};
  const partes: string[] = [];
  const avisos: string[] = [];

  if (citado.base_calculo && citado.base_calculo !== atual.base_calculo) {
    mudancas.base_calculo = citado.base_calculo;
    partes.push(`cobrança ${ROTULO_DA_BASE[atual.base_calculo] ?? atual.base_calculo} → ${ROTULO_DA_BASE[citado.base_calculo] ?? citado.base_calculo}`);
  }

  if (citado.preco !== null) {
    const apurado = custoApurado({ ...atual, base_calculo: (mudancas.base_calculo as string) ?? atual.base_calculo });
    if (apurado.custo_origem === 'amortizacao') {
      if (!mesmoPreco(apurado.preco_base, citado.preco)) {
        avisos.push(
          `${atual.nome}: o custo deste instrumento vem da amortização (valor de aquisição) e dá ${moeda(apurado.preco_base)}. O VALOR DO CADASTRO da planilha (${moeda(citado.preco)}) não muda o cadastro: para mudar, edite o instrumento na tela de Recursos.`,
        );
      }
    } else if (!mesmoPreco(numero(atual.preco_unitario), citado.preco)) {
      mudancas.preco_unitario = citado.preco;
      partes.push(`preço ${moeda(numero(atual.preco_unitario))} → ${moeda(citado.preco)}`);
    }
  }

  // A categoria não muda pela planilha: a REFERÊNCIAS diferente do cadastro só avisa
  if (citado.grupo === 'recursos' && citado.categoria && citado.categoria !== atual.categoria) {
    avisos.push(
      `${atual.nome}: a aba REFERÊNCIAS diz a categoria ${ROTULO_DA_CATEGORIA[citado.categoria] ?? citado.categoria}, e o cadastro tem ${ROTULO_DA_CATEGORIA[atual.categoria] ?? atual.categoria}. A categoria não muda pela planilha: mude na tela de Recursos.`,
    );
  }

  const comAvisos = (feito?: NonNullable<Feito['resultado']>['feito']) =>
    feito || avisos.length > 0 ? { ...(feito && { feito }), ...(avisos.length > 0 && { avisos: avisos.map((mensagem) => ({ mensagem })) }) } : null;

  if (partes.length === 0) return { resultado: comAvisos() };
  if (!usuario.permissions.includes('recursos.manage')) {
    avisos.push(
      `${atual.nome}: a planilha diz ${partes.join(' · ')}, mas acertar o cadastro do recurso pede a permissão da tela de Recursos (recursos.manage). O cadastro fica como está.`,
    );
    return { resultado: comAvisos() };
  }

  const dto = (await validarComoOFormulario(UpdateRecursoDto, mudancas)) as UpdateRecursoDto;
  await servico.atualizar(atual.id, dto);
  return {
    depois: { ...atual, ...mudancas } as recursos,
    resultado: comAvisos({ cadastro: 'recurso', acao: 'alterado', nome: atual.nome, detalhe: partes.join(' · ') }),
  };
}
