import { CreateInstrucaoDto } from '@/modules/instrucoes/dto/create-instrucao.dto';
import { CreateMaquinarioDto } from '@/modules/maquinarios/dto/maquinario.dto';
import { CreatePlanoManutencaoDto } from '@/modules/planos-manutencao/dto/create-plano-manutencao.dto';
import { VincularPlanoDto } from '@/modules/planos-manutencao/dto/vincular-plano.dto';
import { CreateRecursoDto } from '@/modules/recursos/dto/recurso.dto';
import { CreateTarefaDto } from '@/modules/tarefas/dto/create-tarefa.dto';
import { validar } from '../ambiente';
import { idDe, pessoa, type Cenario } from '../cenario';
import { TEMPLATES } from '../dados/catalogo';
import { INSTRUCOES } from '../dados/instrucoes';
import { MAQUINARIOS, RECURSOS } from '../dados/recursos';
import { arquivoDaFoto, fotoDeExemplo } from '../foto';
import { as, diaDe, somarDias } from '../tempo';

export async function criarRecursos(c: Cenario): Promise<void> {
  const quando = as(somarDias(c.inicio, -62), '09:00');
  for (const r of RECURSOS) {
    const dto = await validar(
      CreateRecursoDto,
      {
        categoria: r.categoria,
        nome: r.nome,
        unidade: r.unidade,
        base_calculo: r.base_calculo,
        preco_unitario: r.preco_unitario,
        ...(r.funcao && { funcao: r.funcao }),
        ...(r.descricao && { descricao: r.descricao }),
        ...(r.horas_por_diaria && { horas_por_diaria: r.horas_por_diaria }),
        ...r.proprio,
      },
      `recurso ${r.nome}`,
    );
    const criado = await c.relogio.em(quando, () => c.s.recursos.criar(dto));
    c.recursos.set(r.nome, criado.id.trim());
  }
  for (const m of MAQUINARIOS) {
    const dto = await validar(
      CreateMaquinarioDto,
      {
        nome: m.nome,
        tipo: m.tipo,
        base_calculo: m.base_calculo,
        preco_unitario: m.preco_unitario,
        ...(m.descricao && { descricao: m.descricao }),
        ...(m.horas_por_diaria && { horas_por_diaria: m.horas_por_diaria }),
        ...m.proprio,
      },
      `maquinário ${m.nome}`,
    );
    const criado = await c.relogio.em(quando, () => c.s.maquinarios.criar(dto));
    c.maquinarios.set(m.nome, criado.id.trim());
  }
  c.log(`  recursos: ${c.recursos.size}, maquinários: ${c.maquinarios.size}`);
}

export async function criarInstrucoes(c: Cenario): Promise<void> {
  const autora = pessoa(c, 'renata');
  for (const [i, inst] of INSTRUCOES.entries()) {
    const dto = await validar(
      CreateInstrucaoDto,
      {
        codigo: inst.codigo,
        nome: inst.nome,
        descricao: inst.descricao,
        frente: inst.frente,
        ...(inst.duracao_dias && { duracao_dias: inst.duracao_dias }),
        ativo: !inst.inativa,
        status: inst.inativa ? 'INATIVA' : 'ATIVA',
        sub_instrucoes: inst.passos.map((p, ordem) => ({
          descricao: p.descricao,
          obrigatoria: !p.opcional,
          ...(p.disciplina && { tipo: p.disciplina }),
          ...(p.horas !== undefined && { duracao_horas: p.horas }),
          ordem: ordem + 1,
          registro: p.leitura ? 'LEITURA' : 'VERIFICACAO',
          exige_foto: Boolean(p.foto),
          ...(p.leitura && { unidade: p.leitura.unidade, valor_minimo: p.leitura.min, valor_maximo: p.leitura.max }),
        })),
        recursos: inst.recursos.map(([nome, quantidade, horas, perda]) => ({
          recurso_id: idDe(c.recursos, nome, 'Recurso'),
          quantidade,
          ...(horas !== undefined && { duracao_horas: horas }),
          ...(perda !== undefined && { fator_perda: perda }),
        })),
        maquinarios: (inst.maquinarios ?? []).map(([nome, quantidade, horas]) => ({
          maquinario_id: idDe(c.maquinarios, nome, 'Maquinário'),
          quantidade,
          duracao_horas: horas,
        })),
      },
      `instrução ${inst.codigo}`,
    );
    const criada = await c.relogio.em(as(somarDias(c.inicio, -61 + Math.floor(i / 8)), '10:00'), () => c.s.instrucoes.criar(dto, autora.id));
    c.instrucoes.set(inst.codigo, criada.id.trim());
  }

  // O procedimento que tem desenho leva o esquema anexado, como o cadastro permite
  for (const codigo of ['TR-03', 'DJMT-02', 'SPDA-01']) {
    const foto = fotoDeExemplo('geral', `Esquema de ligação dos instrumentos da instrução ${codigo}`);
    await c.relogio.em(as(somarDias(c.inicio, -58), '15:00'), () =>
      c.s.anexosDaInstrucao.uploadAnexo(idDe(c.instrucoes, codigo, 'Instrução'), arquivoDaFoto(`esquema-${codigo.toLowerCase()}.png`, foto) as Express.Multer.File),
    );
  }
  c.log(`  instruções: ${c.instrucoes.size} (uma inativa), com passos, leituras, fotos e recursos`);
}

/** Os templates por categoria e o vínculo de cada UC ao da sua categoria (só os marcados ficam sem) */
export async function criarPlanos(c: Cenario): Promise<void> {
  const planejadora = pessoa(c, 'renata');
  for (const [i, t] of TEMPLATES.entries()) {
    const categoriaId = c.categorias.get(t.categoria);
    if (!categoriaId) throw new Error(`Categoria do template não existe: ${t.categoria}`);
    const quando = as(somarDias(c.inicio, -57 + Math.floor(i / 6)), '09:30');
    const plano = await c.relogio.em(quando, async () =>
      c.s.planos.criar(
        await validar(CreatePlanoManutencaoDto, { categoria_id: categoriaId, nome: t.nome, descricao: t.descricao, versao: '1.0', criado_por: planejadora.id }, `plano ${t.nome}`),
        planejadora.usuario,
      ),
    );
    const planoId = plano.id.trim();
    c.templates.set(t.categoria, planoId);
    for (const [ordem, tarefa] of t.tarefas.entries()) {
      const dto = await validar(
        CreateTarefaDto,
        {
          nome: tarefa.nome,
          instrucao_id: idDe(c.instrucoes, tarefa.instrucao, 'Instrução'),
          frequencia: tarefa.frequencia,
          criticidade: tarefa.criticidade,
          plano_manutencao_id: planoId,
          ordem: ordem + 1,
          criado_por: planejadora.id,
        },
        `tarefa ${tarefa.nome}`,
      );
      await c.relogio.em(quando, () => c.s.tarefas.criar(dto, planejadora.usuario));
    }
  }

  let vinculados = 0;
  let semPlano = 0;
  for (const e of c.equipamentos.values()) {
    const templateId = c.templates.get(e.categoria);
    if (!templateId || e.dados.semPlano) {
      semPlano++;
      continue;
    }
    // Os planos de uma instalação começam juntos: as preventivas dela saem na mesma OS
    const inicio = somarDias(c.inicio, -e.unidade.dados.planosHaDias);
    const dto = await validar(
      VincularPlanoDto,
      { equipamento_id: e.id, plano_id: templateId, criado_por: planejadora.id, data_inicio: diaDe(inicio) },
      `vínculo do plano de ${e.nome}`,
    );
    await c.relogio.em(as(somarDias(inicio, -3), '11:00'), () => c.s.planos.vincularEquipamento(dto, planejadora.usuario));
    vinculados++;
  }
  const percentual = Math.round((vinculados / (vinculados + semPlano)) * 1000) / 10;
  c.log(`  planos: ${c.templates.size} templates; ${vinculados} UC com plano e ${semPlano} sem (${percentual}% com plano)`);
  if (percentual < 90) throw new Error(`Só ${percentual}% das UC com plano; o combinado é pelo menos 90%`);
}
