/**
 * Popula o cenário de manutenção da UFV Solar Power — SOMENTE DEV.
 *
 * Dirige o fluxo pelos SERVIÇOS reais, não por INSERT. Inserir OS prontas
 * provaria só que a tela desenha; não exercitaria o congelamento do snapshot, o
 * contador de execuções, o avanço da âncora ao cancelar, nem o bloqueio de
 * ciclo do cron — que é justamente o que se quer validar.
 *
 * Cobre, de propósito, os casos que costumam divergir:
 *  - OS finalizada com TODAS as tarefas concluídas  → conta execução
 *  - OS finalizada com tarefa PENDENTE              → NÃO conta aquela tarefa
 *  - OS cancelada                                   → avança a âncora, sem execução
 *  - OS em execução e OS pendente                   → trabalho em aberto
 *  - Programação ainda não aprovada                 → aparece como programação
 *  - OS de ANOMALIA                                 → corretiva, para a tela diferenciar
 *
 * Rodar:  npx ts-node -r tsconfig-paths/register scripts/povoar-manutencao-ufv.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@/core';
import { InstrucoesService } from '../src/modules/instrucoes/instrucoes.service';
import { PlanosManutencaoService } from '../src/modules/planos-manutencao/planos-manutencao.service';
import { TarefasService } from '../src/modules/tarefas/tarefas.service';
import { ProgramacaoOSService } from '../src/modules/programacao-os/programacao-os.service';
import { ExecucaoOSService } from '../src/modules/execucao-os/execucao-os.service';

const diasAtras = (n: number) => new Date(Date.now() - n * 86400000);

/** Instruções de manutenção de usina fotovoltaica, por categoria de equipamento. */
const INSTRUCOES = [
  {
    chave: 'INV_TERMO',
    nome: 'Inspeção termográfica do inversor',
    descricao:
      'Registrar imagem térmica dos módulos de potência, barramentos CC/CA e conexões com o inversor em operação. Investigar qualquer ponto com delta acima de 10 °C em relação aos pontos equivalentes.',
    categoria: 'ELETRICA',
    tipo_manutencao: 'PREDITIVA',
    condicao_ativo: 'FUNCIONANDO',
    criticidade: 4,
    duracao_estimada: 1.5,
    tempo_estimado: 1,
    sub_instrucoes: [
      'Confirmar que o inversor está em operação e com carga representativa',
      'Registrar imagem térmica dos módulos de potência',
      'Registrar imagem térmica dos barramentos CC e CA',
      'Comparar pontos equivalentes e anotar deltas acima de 10 °C',
    ],
  },
  {
    chave: 'INV_FILTRO',
    nome: 'Limpeza dos filtros de ventilação do inversor',
    descricao:
      'Remover, limpar e recolocar os filtros de ar. Filtro obstruído eleva a temperatura interna e derrata o inversor nas horas de maior irradiância.',
    categoria: 'LIMPEZA',
    tipo_manutencao: 'PREVENTIVA',
    condicao_ativo: 'PARADO',
    criticidade: 3,
    duracao_estimada: 1,
    tempo_estimado: 0.75,
    sub_instrucoes: [
      'Desligar o inversor pelo seccionador CC e CA',
      'Remover os filtros e limpar com ar comprimido',
      'Substituir os filtros danificados',
      'Recolocar e religar, conferindo a temperatura após 30 min',
    ],
  },
  {
    chave: 'INV_REAPERTO',
    nome: 'Reaperto das conexões CC e CA do inversor',
    descricao:
      'Reapertar todas as conexões de potência com torquímetro, no torque indicado pelo fabricante. Conexão frouxa é a causa mais comum de aquecimento e falha de string.',
    categoria: 'ELETRICA',
    tipo_manutencao: 'PREVENTIVA',
    condicao_ativo: 'PARADO',
    criticidade: 5,
    duracao_estimada: 2,
    tempo_estimado: 1.5,
    sub_instrucoes: [
      'Bloquear e sinalizar o equipamento',
      'Conferir ausência de tensão nos barramentos',
      'Reapertar as conexões CC no torque de projeto',
      'Reapertar as conexões CA no torque de projeto',
      'Registrar os torques aplicados',
    ],
  },
  {
    chave: 'PV_LIMPEZA',
    nome: 'Limpeza dos módulos fotovoltaicos',
    descricao:
      'Lavar os módulos com água desmineralizada e escova macia, no início da manhã ou fim de tarde. Sujidade acumulada chega a custar mais de 5% de geração.',
    categoria: 'LIMPEZA',
    tipo_manutencao: 'PREVENTIVA',
    condicao_ativo: 'QUALQUER',
    criticidade: 2,
    duracao_estimada: 4,
    tempo_estimado: 3,
    sub_instrucoes: [
      'Verificar temperatura dos módulos antes de aplicar água',
      'Lavar as fileiras com água desmineralizada e escova macia',
      'Registrar a geração antes e depois da limpeza',
    ],
  },
  {
    chave: 'PV_INSPECAO',
    nome: 'Inspeção visual dos módulos fotovoltaicos',
    descricao:
      'Procurar trincas, delaminação, pontos quentes, oxidação de conectores MC4 e sombreamento novo. Fotografar e abrir anomalia para cada ocorrência.',
    categoria: 'INSPECAO',
    tipo_manutencao: 'INSPECAO',
    condicao_ativo: 'QUALQUER',
    criticidade: 3,
    duracao_estimada: 2,
    tempo_estimado: 1.5,
    sub_instrucoes: [
      'Percorrer as fileiras procurando trincas e delaminação',
      'Conferir conectores MC4 quanto a oxidação',
      'Verificar sombreamento novo por vegetação ou estrutura',
      'Fotografar e abrir anomalia para cada ocorrência',
    ],
  },
  {
    chave: 'DJ_TESTE',
    nome: 'Teste de atuação do disjuntor',
    descricao:
      'Ensaiar a atuação por sobrecorrente e verificar tempo de resposta contra a curva de proteção do projeto.',
    categoria: 'ELETRICA',
    tipo_manutencao: 'PREVENTIVA',
    condicao_ativo: 'PARADO',
    criticidade: 5,
    duracao_estimada: 2,
    tempo_estimado: 1.5,
    sub_instrucoes: [
      'Isolar o circuito e sinalizar',
      'Ensaiar atuação por sobrecorrente',
      'Comparar o tempo de resposta com a curva de projeto',
      'Registrar o resultado e liberar o circuito',
    ],
  },
  {
    chave: 'DJ_TERMO',
    nome: 'Inspeção termográfica do quadro de distribuição',
    descricao:
      'Termografia do quadro com carga, procurando desequilíbrio entre fases e conexões aquecidas.',
    categoria: 'ELETRICA',
    tipo_manutencao: 'PREDITIVA',
    condicao_ativo: 'FUNCIONANDO',
    criticidade: 4,
    duracao_estimada: 1,
    tempo_estimado: 0.75,
    sub_instrucoes: [
      'Abrir o quadro com o EPI adequado',
      'Registrar imagem térmica de cada fase',
      'Anotar desequilíbrio entre fases',
    ],
  },
  {
    chave: 'TR_OLEO',
    nome: 'Análise físico-química do óleo isolante',
    descricao:
      'Coletar amostra do óleo e enviar para ensaio de rigidez dielétrica, teor de água e acidez.',
    categoria: 'ELETRICA',
    tipo_manutencao: 'PREDITIVA',
    condicao_ativo: 'FUNCIONANDO',
    criticidade: 5,
    duracao_estimada: 1.5,
    tempo_estimado: 1,
    sub_instrucoes: [
      'Coletar amostra pelo registro inferior, descartando o primeiro volume',
      'Identificar e lacrar a amostra',
      'Enviar ao laboratório e anexar o laudo à OS',
    ],
  },
  {
    chave: 'TR_NIVEL',
    nome: 'Verificação de nível e vazamento de óleo',
    descricao:
      'Conferir o nível no visor, procurar vazamento em juntas, radiadores e buchas, e verificar o sílica-gel do respiro.',
    categoria: 'INSPECAO',
    tipo_manutencao: 'INSPECAO',
    condicao_ativo: 'FUNCIONANDO',
    criticidade: 4,
    duracao_estimada: 0.5,
    tempo_estimado: 0.5,
    sub_instrucoes: [
      'Conferir o nível de óleo no visor',
      'Inspecionar juntas, radiadores e buchas',
      'Verificar a coloração do sílica-gel do respiro',
    ],
  },
  {
    chave: 'PM_COMUNICACAO',
    nome: 'Verificação de comunicação e leitura do medidor',
    descricao:
      'Conferir se o medidor está publicando no supervisório e comparar a leitura local com a exibida no sistema.',
    categoria: 'INSTRUMENTACAO',
    tipo_manutencao: 'INSPECAO',
    condicao_ativo: 'FUNCIONANDO',
    criticidade: 3,
    duracao_estimada: 0.5,
    tempo_estimado: 0.5,
    sub_instrucoes: [
      'Conferir se há publicação recente no supervisório',
      'Comparar a leitura do display com a do sistema',
      'Registrar divergência acima de 1%',
    ],
  },
] as const;

/** Um plano template por categoria, com as tarefas e as periodicidades. */
const PLANOS = [
  {
    categoria: 'Inversor PV',
    nome: 'Plano de manutenção — Inversor fotovoltaico',
    descricao: 'Rotina preventiva e preditiva dos inversores de usina fotovoltaica.',
    tarefas: [
      { nome: 'Inspeção termográfica', instrucao: 'INV_TERMO', frequencia: 'SEMESTRAL', criticidade: 4 },
      { nome: 'Limpeza dos filtros de ventilação', instrucao: 'INV_FILTRO', frequencia: 'TRIMESTRAL', criticidade: 3 },
      { nome: 'Reaperto das conexões CC e CA', instrucao: 'INV_REAPERTO', frequencia: 'ANUAL', criticidade: 5 },
    ],
  },
  {
    categoria: 'Módulos PV',
    nome: 'Plano de manutenção — Módulos fotovoltaicos',
    descricao: 'Limpeza e inspeção das fileiras de módulos.',
    tarefas: [
      { nome: 'Limpeza dos módulos', instrucao: 'PV_LIMPEZA', frequencia: 'MENSAL', criticidade: 2 },
      { nome: 'Inspeção visual das fileiras', instrucao: 'PV_INSPECAO', frequencia: 'SEMESTRAL', criticidade: 3 },
    ],
  },
  {
    categoria: 'Disjuntor BT',
    nome: 'Plano de manutenção — Disjuntor de baixa tensão',
    descricao: 'Ensaio de atuação e termografia do quadro.',
    tarefas: [
      { nome: 'Teste de atuação', instrucao: 'DJ_TESTE', frequencia: 'ANUAL', criticidade: 5 },
      { nome: 'Termografia do quadro', instrucao: 'DJ_TERMO', frequencia: 'SEMESTRAL', criticidade: 4 },
    ],
  },
  {
    categoria: 'Transformador de Potência',
    nome: 'Plano de manutenção — Transformador de potência',
    descricao: 'Acompanhamento do óleo isolante e inspeção de vedação.',
    tarefas: [
      { nome: 'Análise do óleo isolante', instrucao: 'TR_OLEO', frequencia: 'ANUAL', criticidade: 5 },
      { nome: 'Verificação de nível e vazamento', instrucao: 'TR_NIVEL', frequencia: 'MENSAL', criticidade: 4 },
    ],
  },
  {
    categoria: 'Power Meter (PM)',
    nome: 'Plano de manutenção — Medição',
    descricao: 'Conferência de comunicação e leitura dos medidores.',
    tarefas: [
      { nome: 'Verificação de comunicação e leitura', instrucao: 'PM_COMUNICACAO', frequencia: 'TRIMESTRAL', criticidade: 3 },
    ],
  },
] as const;

/**
 * As categorias no banco estão com mojibake (`M├│dulos PV`), então comparar por
 * igualdade não acha. Normaliza tirando tudo que não é letra ou número.
 */
const chaveTexto = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira o acento, mantendo a letra
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

/**
 * A mesma chave, mas SEM a letra que levava acento.
 *
 * As categorias no banco estao com mojibake: "Modulos PV" virou "M<box><box>dulos PV",
 * ou seja, o 'o' acentuado sumiu inteiro. Comparando os dois formatos, um
 * lado perde a letra e o outro nao — dai a categoria nao ser encontrada.
 */
const chaveSemAcentuadas = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[a-zA-Z](?=[̀-ͯ])/g, '') // remove a letra que tinha acento
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const mesmaCategoria = (doBanco: string, meu: string) => {
  const b = chaveTexto(doBanco);
  return b === chaveTexto(meu) || b === chaveSemAcentuadas(meu);
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  const prisma = app.get(PrismaService);
  const instrucoesService = app.get(InstrucoesService);
  const planosService = app.get(PlanosManutencaoService);
  const tarefasService = app.get(TarefasService);
  const programacaoService = app.get(ProgramacaoOSService);
  const execucaoService = app.get(ExecucaoOSService);

  const log = (...args: any[]) => console.log(...args);

  // ---------------------------------------------------------------- contexto
  const planta = await prisma.plantas.findFirst({
    where: { nome: { contains: 'SOLAR POWER', mode: 'insensitive' }, deleted_at: null },
    select: { id: true, nome: true },
  });
  if (!planta) throw new Error('Planta UFV Solar Power não encontrada');
  log(`planta: ${planta.nome}`);

  const usuario = await prisma.usuarios.findFirst({
    where: { deleted_at: null, is_active: true },
    select: { id: true, nome: true },
  });
  const usuarioId = usuario?.id;
  log(`operando como: ${usuario?.nome ?? '(sistema)'}`);

  const categorias = await prisma.categorias_equipamentos.findMany({ select: { id: true, nome: true } });
  const acharCategoria = (nome: string) => categorias.find((c) => mesmaCategoria(c.nome, nome));

  const unidades = await prisma.unidades.findMany({
    where: { planta_id: planta.id, deleted_at: null },
    select: { id: true },
  });

  // ------------------------------------------------------------- instruções
  log('\n=== instruções ===');
  const instrucaoPorChave = new Map<string, string>();

  for (const def of INSTRUCOES) {
    const existente = await prisma.instrucoes.findFirst({
      where: { nome: def.nome, deleted_at: null },
      select: { id: true, tag: true },
    });

    if (existente) {
      instrucaoPorChave.set(def.chave, existente.id);
      log(`  = ${existente.tag} ${def.nome} (já existia)`);
      continue;
    }

    const criada = await instrucoesService.criar({
      nome: def.nome,
      descricao: def.descricao,
      categoria: def.categoria as any,
      tipo_manutencao: def.tipo_manutencao as any,
      condicao_ativo: def.condicao_ativo as any,
      criticidade: def.criticidade,
      duracao_estimada: def.duracao_estimada,
      tempo_estimado: def.tempo_estimado,
      criado_por: usuarioId,
      sub_instrucoes: def.sub_instrucoes.map((descricao, i) => ({
        descricao,
        ordem: i + 1,
        tempo_estimado: 0.25,
      })) as any,
    } as any);

    instrucaoPorChave.set(def.chave, criada.id);
    log(`  + ${criada.tag} ${def.nome}`);
  }

  // ------------------------------------------------------ planos (templates)
  log('\n=== planos template ===');
  const planoPorCategoria = new Map<string, string>();

  for (const def of PLANOS) {
    const categoria = acharCategoria(def.categoria);
    if (!categoria) {
      log(`  ! categoria "${def.categoria}" não encontrada — plano ignorado`);
      continue;
    }

    let plano = await prisma.planos_manutencao.findFirst({
      where: { nome: def.nome, equipamento_id: null, deleted_at: null },
      select: { id: true },
    });

    if (plano) {
      log(`  = ${def.nome} (já existia)`);
    } else {
      const criado = await planosService.criar({
        categoria_id: categoria.id,
        nome: def.nome,
        descricao: def.descricao,
        criado_por: usuarioId,
      } as any);
      plano = { id: criado.id };
      log(`  + ${def.nome}`);

      for (const [i, t] of def.tarefas.entries()) {
        const instrucaoId = instrucaoPorChave.get(t.instrucao);
        if (!instrucaoId) continue;

        await tarefasService.criar({
          nome: t.nome,
          instrucao_id: instrucaoId,
          frequencia: t.frequencia as any,
          criticidade: t.criticidade,
          plano_manutencao_id: plano.id,
          ordem: i + 1,
          criado_por: usuarioId,
        } as any);
        log(`      · ${t.nome} (${t.frequencia})`);
      }
    }

    planoPorCategoria.set(def.categoria, plano.id);
  }

  // --------------------------------------------- vincular plano a equipamento
  log('\n=== vínculo plano → equipamento ===');
  const equipamentos = await prisma.equipamentos.findMany({
    where: { unidade_id: { in: unidades.map((u) => u.id) }, deleted_at: null, classificacao: 'UC' },
    select: {
      id: true,
      nome: true,
      tipo_equipamento_rel: { select: { categoria_id: true } },
    },
  });

  /** Equipamentos escolhidos para o cenário, um papel para cada. */
  const escolhidos: Array<{ id: string; nome: string }> = [];

  for (const eq of equipamentos) {
    const catId = eq.tipo_equipamento_rel?.categoria_id;
    if (!catId) continue;

    const cat = categorias.find((c) => c.id === catId);
    const planoId = cat
      ? PLANOS.map((d) => d.categoria).find((nome) => mesmaCategoria(cat.nome, nome))
      : undefined;
    const planoIdResolvido = planoId ? planoPorCategoria.get(planoId) : undefined;
    if (!planoIdResolvido) continue;

    const jaTem = await prisma.planos_manutencao.findFirst({
      where: { equipamento_id: eq.id, deleted_at: null },
      select: { id: true },
    });

    if (!jaTem) {
      const r = await planosService.vincularEquipamento({
        equipamento_id: eq.id,
        plano_id: planoIdResolvido,
      } as any);
      log(`  + ${eq.nome.trim()} → ${r.tarefas_copiadas} tarefa(s)`);
    } else {
      log(`  = ${eq.nome.trim()} (já tinha plano)`);
    }

    escolhidos.push({ id: eq.id, nome: eq.nome.trim() });
  }

  log(`\n${escolhidos.length} equipamentos com plano vinculado`);

  // ------------------------------------------------------- cenário de ordens
  log('\n=== ordens de serviço ===');

  /** Tarefas vivas de um equipamento, na ordem do plano. */
  const tarefasDe = async (equipamentoId: string) =>
    prisma.tarefas.findMany({
      where: { equipamento_id: equipamentoId, deleted_at: null },
      select: { id: true, nome: true },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    });

  /** Programação PENDENTE a partir das tarefas do equipamento. */
  const programar = async (eq: { id: string; nome: string }, descricao: string) => {
    const tarefas = await tarefasDe(eq.id);
    if (tarefas.length === 0) return null;

    const prog = await programacaoService.criarDeTarefas(
      {
        tarefas_ids: tarefas.map((t) => t.id),
        descricao,
        prioridade: 'MEDIA',
        data_hora_programada: diasAtras(20).toISOString(),
        agrupar_por: 'equipamento',
      } as any,
      usuarioId,
    );

    return { id: prog.id, tarefas };
  };

  /**
   * Aprova e deixa a OS EM_EXECUCAO.
   *
   * Aprovar já cria a ordem de serviço — `iniciarDeProgramacao` é o caminho
   * alternativo, para quem parte da programação sem passar pela aprovação, e
   * usá-lo aqui dava "já existe uma ordem de serviço para esta programação".
   */
  const abrirOS = async (programacaoId: string) => {
    await programacaoService.aprovar(
      programacaoId,
      { observacoes: 'Aprovada para execução' } as any,
      usuarioId,
    );

    const os = await prisma.ordens_servico.findFirst({
      where: { programacao_id: programacaoId, deletado_em: null },
      select: { id: true },
    });
    if (!os) throw new Error('aprovação não gerou OS');

    await execucaoService.iniciar(os.id, { responsavel_execucao: usuario?.nome } as any, usuarioId);
    return os.id;
  };

  const cenarios: Array<[string, () => Promise<string>]> = [];

  // Um papel por equipamento, para a tela ter variedade de verdade.
  //
  // O cenário "OS finalizada com uma tarefa pendente" só faz sentido em
  // equipamento com DUAS ou mais tarefas — num de tarefa única, concluir
  // "todas menos uma" acaba concluindo a única, e o caso não é testado.
  const contagens = await Promise.all(
    escolhidos.map(async (e) => ({
      ...e,
      total: await prisma.tarefas.count({ where: { equipamento_id: e.id, deleted_at: null } }),
    })),
  );

  const comVarias = contagens.filter((e) => e.total >= 2);
  const comUma = contagens.filter((e) => e.total === 1);

  const alvoCompleta = comUma[0];
  const alvoParcial = comVarias[0];
  const alvoCancelada = comUma[1];
  const alvoEmExecucao = comVarias[1];
  const alvoPendente = comUma[2];
  const alvoProgramacao = comVarias[2];
  const alvoAnomalia = comUma[3] ?? comVarias[3];

  // 1) OS finalizada com TODAS as tarefas concluídas — deve contar execução
  if (alvoCompleta) {
    cenarios.push([
      `${alvoCompleta.nome}: OS finalizada, tudo concluído`,
      async () => {
        const p1 = await programar(alvoCompleta, `Manutenção preventiva — ${alvoCompleta.nome}`);
        if (!p1) return 'sem tarefas';
        const osId = await abrirOS(p1.id);

        const vinculos = await prisma.tarefas_os.findMany({
          where: { os_id: osId, tarefa_id: { not: null } },
          select: { tarefa_id: true },
        });
        for (const v of vinculos) {
          await execucaoService.concluirTarefa(osId, v.tarefa_id!, { observacoes: 'Executado conforme instrução' } as any, usuarioId);
        }

        await execucaoService.executar(osId, { resultado_servico: 'Serviço executado sem intercorrências' } as any, usuarioId);
        await execucaoService.auditar(osId, { avaliacao_qualidade: 5, observacoes_qualidade: 'Conforme' } as any, usuarioId);
        await execucaoService.finalizar(osId, { observacoes: 'Encerrada' } as any, usuarioId);
        return osId;
      },
    ]);
  }

  // 2) OS finalizada com UMA tarefa pendente — a pendente NÃO conta execução
  if (alvoParcial) {
    cenarios.push([
      `${alvoParcial.nome}: OS finalizada, uma tarefa ficou pendente`,
      async () => {
        const p2 = await programar(alvoParcial, `Manutenção preventiva — ${alvoParcial.nome}`);
        if (!p2) return 'sem tarefas';
        const osId = await abrirOS(p2.id);

        const vinculos = await prisma.tarefas_os.findMany({
          where: { os_id: osId, tarefa_id: { not: null } },
          select: { tarefa_id: true },
        });
        for (const v of vinculos.slice(0, Math.max(1, vinculos.length - 1))) {
          await execucaoService.concluirTarefa(osId, v.tarefa_id!, { observacoes: 'Executado' } as any, usuarioId);
        }

        await execucaoService.executar(osId, { resultado_servico: 'Parcial: faltou insumo para uma tarefa' } as any, usuarioId);
        await execucaoService.auditar(osId, { avaliacao_qualidade: 3, observacoes_qualidade: 'Pendência registrada' } as any, usuarioId);
        await execucaoService.finalizar(osId, { observacoes: 'Encerrada com pendência' } as any, usuarioId);
        return osId;
      },
    ]);
  }

  // 3) OS cancelada — avança a âncora sem registrar execução
  if (alvoCancelada) {
    cenarios.push([
      `${alvoCancelada.nome}: OS cancelada`,
      async () => {
        const p3 = await programar(alvoCancelada, `Manutenção preventiva — ${alvoCancelada.nome}`);
        if (!p3) return 'sem tarefas';
        const osId = await abrirOS(p3.id);
        await execucaoService.cancelar(osId, { motivo_cancelamento: 'Equipe remanejada para emergência' } as any, usuarioId);
        return osId;
      },
    ]);
  }

  // 4) OS em execução — trabalho em aberto
  if (alvoEmExecucao) {
    cenarios.push([
      `${alvoEmExecucao.nome}: OS em execução`,
      async () => {
        const p4 = await programar(alvoEmExecucao, `Manutenção preventiva — ${alvoEmExecucao.nome}`);
        if (!p4) return 'sem tarefas';
        return abrirOS(p4.id);
      },
    ]);
  }

  // 5) Programação aprovada mas ainda sem OS aberta
  if (alvoPendente) {
    cenarios.push([
      `${alvoPendente.nome}: programação aprovada, OS ainda não aberta`,
      async () => {
        const p5 = await programar(alvoPendente, `Manutenção preventiva — ${alvoPendente.nome}`);
        if (!p5) return 'sem tarefas';
        await programacaoService.aprovar(p5.id, { observacoes: 'Aprovada' } as any, usuarioId);
        return p5.id;
      },
    ]);
  }

  // 6) Programação ainda pendente de aprovação
  if (alvoProgramacao) {
    cenarios.push([
      `${alvoProgramacao.nome}: programação aguardando aprovação`,
      async () => {
        const p6 = await programar(alvoProgramacao, `Manutenção preventiva — ${alvoProgramacao.nome}`);
        return p6 ? p6.id : 'sem tarefas';
      },
    ]);
  }

  // 7) OS nascida de ANOMALIA — corretiva. É o caso que a aba de histórico
  //    precisa diferenciar das preventivas que vêm do plano.
  if (alvoAnomalia) {
    cenarios.push([
      `${alvoAnomalia.nome}: OS corretiva a partir de anomalia`,
      async () => {
        const equipamento = await prisma.equipamentos.findFirst({
          where: { id: alvoAnomalia.id },
          select: { id: true, nome: true, unidade: { select: { planta_id: true } } },
        });

        const anomalia = await prisma.anomalias.create({
          data: {
            descricao: `Ruído anormal e aquecimento em ${alvoAnomalia.nome}`,
            local: 'UFV Solar Power',
            ativo: alvoAnomalia.nome,
            condicao: 'FUNCIONANDO',
            origem: 'OPERADOR',
            status: 'REGISTRADA',
            prioridade: 'ALTA',
            planta_id: equipamento?.unidade?.planta_id ?? null,
            equipamento_id: alvoAnomalia.id,
            data: diasAtras(3),
            ...(usuarioId && { criado_por: usuarioId }),
          },
          select: { id: true },
        });

        const prog = await programacaoService.criarDeAnomalia(
          anomalia.id,
          { ajustes: { descricao: `Correção — ${alvoAnomalia.nome}`, prioridade: 'ALTA' } } as any,
          usuarioId,
        );

        const osId = await abrirOS(prog.id);
        await execucaoService.executar(
          osId,
          { resultado_servico: 'Mancal lubrificado e ruído cessou' } as any,
          usuarioId,
        );
        await execucaoService.auditar(
          osId,
          { avaliacao_qualidade: 4, observacoes_qualidade: 'Acompanhar na próxima inspeção' } as any,
          usuarioId,
        );
        await execucaoService.finalizar(osId, { observacoes: 'Encerrada' } as any, usuarioId);
        return osId;
      },
    ]);
  }

  for (const [rotulo, executar] of cenarios) {
    try {
      const id = await executar();
      log(`  + ${rotulo} → ${id}`);
    } catch (e: any) {
      log(`  ! ${rotulo} → FALHOU: ${e?.message ?? e}`);
      if (process.env.STACK) console.log(e?.stack);
    }
  }

  await app.close();
}

main().catch((e) => {
  console.error('\nFALHOU:', e?.message ?? e);
  process.exit(1);
});
