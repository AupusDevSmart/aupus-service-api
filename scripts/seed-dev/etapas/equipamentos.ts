import { CreateEquipamentoDto } from '@/core/modules/equipamentos/dto/create-equipamento.dto';
import { criticidadeSugerida } from '@/core/modules/equipamentos/criticidade-pela-matriz';
import { CriarAtivoFuncionalDto } from '@/core/modules/ativos-funcionais/dto/ativo-funcional.dto';
import { validar } from '../ambiente';
import { chaveDoEquipamento, type Cenario, type Equipamento, type Planta, type Unidade } from '../cenario';
import { camposTecnicos } from '../dados/campos-tecnicos';
import type { EquipamentoDoSeed } from '../dados/plantas';
import { as, somarDias } from '../tempo';

let sequencial = 0;

/** O número de série da placa: fabricante, ano e sequência (estável entre execuções) */
function numeroDeSerie(fabricante: string, instalado: string): string {
  sequencial += 1;
  const sigla = fabricante.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'GEN';
  return `${sigla}${instalado.slice(2, 4)}${String(sequencial).padStart(5, '0')}`;
}

/** Os anos de vida útil contábil por família, para a depreciação da tela */
function vidaUtil(categoria: string): number {
  if (categoria.startsWith('Transformador')) return 30;
  if (categoria.startsWith('Inversor')) return 12;
  if (categoria.startsWith('Módulos')) return 25;
  if (categoria.startsWith('Motor') || categoria.startsWith('Pivô')) return 15;
  return 20;
}

/**
 * O corpo do formulário do equipamento. O nome próprio é o do modelo com a
 * série (é o que distingue o equipamento de hoje do que ocupou a posição
 * antes); a tela mostra o nome da posição.
 */
export async function corpoDoEquipamento(
  c: Cenario,
  planta: Planta,
  unidade: Unidade,
  dados: EquipamentoDoSeed,
  instalado = dados.instalado,
): Promise<CreateEquipamentoDto> {
  const modelo = c.modelos.get(dados.modelo);
  if (!modelo) throw new Error(`Modelo do seed não existe: ${dados.modelo}`);
  const serie = numeroDeSerie(modelo.fabricante, instalado);
  const sugerida = criticidadeSugerida(dados.impacto, dados.probabilidade);
  const valor = dados.valor;
  const anos = Math.max(0, (c.agora.getTime() - new Date(instalado).getTime()) / (365.25 * 86_400_000));
  const vida = vidaUtil(modelo.categoria);
  return validar(
    CreateEquipamentoDto,
    {
      nome: `${modelo.nome} (${serie})`,
      classificacao: 'UC',
      unidade_id: unidade.id,
      fabricante: modelo.fabricante,
      modelo: modelo.nome,
      numero_serie: serie,
      tipo_equipamento_id: modelo.id,
      criticidade: String(dados.criticidade?.nivel ?? sugerida),
      criticidade_impacto: dados.impacto,
      criticidade_probabilidade: dados.probabilidade,
      ...(dados.criticidade && { criticidade_motivo: dados.criticidade.motivo }),
      em_operacao: 'sim',
      status: 'Ativo',
      data_instalacao: instalado,
      data_imobilizacao: instalado,
      ...(dados.garantiaAte && { garantia_ate: dados.garantiaAte }),
      ...(valor && {
        valor_imobilizado: valor,
        valor_depreciacao: Math.round(Math.min(valor, (valor / vida) * anos) * 100) / 100,
        valor_contabil: Math.round(Math.max(0, valor - (valor / vida) * anos) * 100) / 100,
        tipo_depreciacao: 'Linear',
        vida_util: vida,
      }),
      fornecedor: planta.dados.fornecedor,
      centro_custo: planta.dados.centroCusto,
      localizacao: unidade.nome,
      ...(dados.localizacao && { localizacao_especifica: dados.localizacao }),
      dados_tecnicos: camposTecnicos(dados.modelo, serie, instalado.slice(0, 4)),
    },
    `equipamento ${dados.nome}`,
  );
}

/** Posição, equipamento e a instalação dele nela, como a tela faz (três rotas) */
async function criarNaPosicao(c: Cenario, planta: Planta, unidade: Unidade, dados: EquipamentoDoSeed): Promise<Equipamento> {
  const modelo = c.modelos.get(dados.modelo)!;
  const categoriaId = c.categorias.get(modelo.categoria);
  if (!categoriaId) throw new Error(`Categoria sem id: ${modelo.categoria}`);

  const posicao = await c.s.posicoes.criar(
    await validar(
      CriarAtivoFuncionalDto,
      { nome: dados.nome, categoria_id: categoriaId, unidade_id: unidade.id, localizacao: unidade.nome, ...(dados.localizacao && { localizacao_especifica: dados.localizacao }) },
      `posição ${dados.nome}`,
    ),
  );
  const criado = await c.s.equipamentos.create(await corpoDoEquipamento(c, planta, unidade, dados));
  await c.s.posicoes.instalar(posicao.id.trim(), criado.id.trim(), { motivo: 'Instalação inicial' });

  for (const componente of dados.componentes ?? []) {
    const modeloDoComponente = componente.modelo ? c.modelos.get(componente.modelo) : undefined;
    await c.s.equipamentos.create(
      await validar(
        CreateEquipamentoDto,
        {
          nome: componente.nome,
          classificacao: 'UAR',
          equipamento_pai_id: criado.id.trim(),
          criticidade: '2',
          status: 'Ativo',
          em_operacao: 'sim',
          data_instalacao: dados.instalado,
          ...(modeloDoComponente && {
            tipo_equipamento_id: modeloDoComponente.id,
            fabricante: modeloDoComponente.fabricante,
            modelo: modeloDoComponente.nome,
            numero_serie: numeroDeSerie(modeloDoComponente.fabricante, dados.instalado),
          }),
        },
        `componente ${componente.nome}`,
      ),
    );
  }

  return {
    id: criado.id.trim(),
    nome: dados.nome,
    planta,
    unidade,
    categoria: modelo.categoria,
    modelo: dados.modelo,
    posicaoId: posicao.id.trim(),
    dados,
  };
}

export async function criarEquipamentos(c: Cenario): Promise<void> {
  let componentes = 0;
  for (const [i, planta] of [...c.plantas.values()].entries()) {
    for (const [j, unidade] of [...planta.unidades.values()].entries()) {
      const quando = as(somarDias(c.inicio, -65 + i * 2 + j), '14:00');
      for (const dados of unidade.dados.equipamentos) {
        const e = await c.relogio.em(quando, () => criarNaPosicao(c, planta, unidade, dados));
        c.equipamentos.set(chaveDoEquipamento(planta.chave, unidade.nome, dados.nome), e);
        componentes += dados.componentes?.length ?? 0;
      }
    }
  }
  c.log(`  equipamentos: ${c.equipamentos.size} UC em posições, ${componentes} componentes`);
}
