import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService, PermissionScopeService, TipoAnexoOS } from '@/core';
import { AnexosOSService } from './anexos-os.service';
import { ExecucaoOSService } from './execucao-os.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { arquivoDeTeste } from '../../../test/arquivo-de-teste';

/**
 * Foto por tarefa e por item do checklist (SN-59), contra Postgres de verdade.
 *
 * O anexo pode provar uma tarefa da OS ou um item do checklist; o passo da
 * instrução pode exigir foto, e o item da OS congela isso: o item que exige
 * foto só é marcado com uma foto dele, e a última foto do item marcado não
 * sai (o item ficaria feito sem a prova).
 *
 * Roda com `npx jest --runInBand src/modules/execucao-os/fotos-por-item`.
 */
describe('fotos por tarefa e por item do checklist (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);
  const anexos = new AnexosOSService(prisma, scope);

  const PREFIXO = 'TESTE-FOTOS-ITEM';
  const TAG_INSTRUCAO = 'TESTE-FOTO-INST-1';
  const arquivosCriados: string[] = [];

  let instrucaoId: string;
  let tarefaId: string;
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const limpar = async () => {
    const progs = await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } });
    const ids = progs.map((p) => p.id);
    const osIds = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } })).map((o) => o.id);
    await prisma.anexos_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.checklist_atividades_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.registros_tempo_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...ids, ...osIds].map((i) => i.trim()) } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: osIds } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    await limpar();
    planta = await criarPlantaDeTeste(prisma, 'fotositem', '95.000.000/0001-59');
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: 'TESTE-FOTO-' } } });
    await prisma.sub_instrucoes.deleteMany({ where: { instrucao: { codigo: TAG_INSTRUCAO } } });
    await prisma.instrucoes.deleteMany({ where: { codigo: TAG_INSTRUCAO } });

    instrucaoId = (
      await prisma.instrucoes.create({
        data: {
          codigo: TAG_INSTRUCAO,
          nome: 'Troca de fusível',
          descricao: 'Instrução de teste',
        },
      })
    ).id;
    await prisma.sub_instrucoes.createMany({
      data: [
        { instrucao_id: instrucaoId, descricao: 'Fotografar o fusível queimado', ordem: 1, obrigatoria: true, exige_foto: true },
        { instrucao_id: instrucaoId, descricao: 'Tensão depois da troca', ordem: 2, registro: 'LEITURA', unidade: 'V', exige_foto: true },
        { instrucao_id: instrucaoId, descricao: 'Limpar o painel', ordem: 3 },
      ],
    });
    tarefaId = (
      await prisma.tarefas.create({ data: { tag: 'TESTE-FOTO-T1', nome: 'Trocar fusível', criticidade: 3, ordem: 1, instrucao_id: instrucaoId } })
    ).id.trim();
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    for (const caminho of arquivosCriados) if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    await prisma.tarefas.deleteMany({ where: { tag: { startsWith: 'TESTE-FOTO-' } } });
    await prisma.sub_instrucoes.deleteMany({ where: { instrucao: { codigo: TAG_INSTRUCAO } } });
    await prisma.instrucoes.deleteMany({ where: { codigo: TAG_INSTRUCAO } });
    await planta.apagar();
    await prisma.$disconnect();
  });

  const osEmExecucao = async () => {
    const prog = await programacoes.criar({
      descricao: `${PREFIXO} programação`,
      condicoes: 'PARADO',
      tipo: 'CORRETIVA',
      prioridade: 'MEDIA',
      origem: 'TAREFA',
      planta_id: planta.id,
      tarefas_ids: [tarefaId],
    } as never);
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await execucoes.iniciar(os.id, {} as never);
    const vinculo = await prisma.tarefas_os.findFirstOrThrow({ where: { os_id: os.id } });
    const [fusivel, tensao, limpeza] = await prisma.checklist_atividades_os.findMany({ where: { os_id: os.id }, orderBy: { ordem: 'asc' } });
    return { osId: os.id, vinculoId: vinculo.id, fusivel, tensao, limpeza };
  };

  const arquivo = (nome = 'fusivel.jpg', mimetype = 'image/jpeg') => arquivoDeTeste(nome, mimetype);

  const enviar = async (osId: string, destino: { tarefa_os_id?: string; checklist_item_id?: string }, nome?: string, mimetype?: string) => {
    const anexo = await anexos.uploadAnexo(osId, arquivo(nome, mimetype), TipoAnexoOS.FOTO_DURANTE, undefined, undefined, undefined, destino);
    arquivosCriados.push((await prisma.anexos_os.findUniqueOrThrow({ where: { id: anexo.id } })).caminho_s3);
    return anexo;
  };

  const item = (id: string) => prisma.checklist_atividades_os.findUniqueOrThrow({ where: { id } });

  it('o item nasce com o "exige foto" do passo', async () => {
    const { fusivel, tensao, limpeza } = await osEmExecucao();

    expect([fusivel.exige_foto, tensao.exige_foto, limpeza.exige_foto]).toEqual([true, true, false]);
  });

  it('o item que exige foto não é marcado sem uma; com a foto dele, é', async () => {
    const { osId, fusivel } = await osEmExecucao();

    await expect(execucoes.atualizarChecklist(osId, { atividades: [{ id: fusivel.id, concluida: true }] })).rejects.toThrow(
      /Fotografe o item .*Fotografar o fusível queimado/,
    );

    await enviar(osId, { checklist_item_id: fusivel.id });
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: fusivel.id, concluida: true }] });
    expect((await item(fusivel.id)).concluida).toBe(true);
  });

  it('a leitura que exige foto: o valor espera a foto', async () => {
    const { osId, tensao } = await osEmExecucao();

    await expect(execucoes.atualizarChecklist(osId, { atividades: [{ id: tensao.id, valor_lido: 220 }] })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await enviar(osId, { checklist_item_id: tensao.id });
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: tensao.id, valor_lido: 220 }] });
    expect(Number((await item(tensao.id)).valor_lido)).toBe(220);
  });

  it('documento não conta como foto; a foto da tarefa também não vale pelo item', async () => {
    const { osId, vinculoId, fusivel } = await osEmExecucao();
    await enviar(osId, { checklist_item_id: fusivel.id }, 'laudo.pdf', 'application/pdf');
    await enviar(osId, { tarefa_os_id: vinculoId });

    await expect(execucoes.atualizarChecklist(osId, { atividades: [{ id: fusivel.id, concluida: true }] })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // Revisão do SN-59: o tipo vinha do cliente — um PDF declarado image/jpeg
  // contava como foto, e um SVG com script voltava como SVG
  it('o tipo gravado é o da extensão, não o que o cliente declara; conteúdo trocado é recusado', async () => {
    const { osId, fusivel } = await osEmExecucao();

    const anexo = await enviar(osId, { checklist_item_id: fusivel.id }, 'fusivel.png', 'image/svg+xml');
    expect(anexo.mime_type).toBe('image/png');

    await expect(
      anexos.uploadAnexo(osId, { ...arquivoDeTeste('laudo.pdf'), originalname: 'foto.jpg', mimetype: 'image/jpeg' }, TipoAnexoOS.FOTO_DURANTE),
    ).rejects.toBeInstanceOf(BadRequestException);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    await expect(
      anexos.uploadAnexo(osId, { originalname: 'foto.png', mimetype: 'image/png', size: svg.length, buffer: svg }, TipoAnexoOS.FOTO_DURANTE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a resposta não leva o caminho do arquivo no disco', async () => {
    const { osId } = await osEmExecucao();
    const anexo = await enviar(osId, {});

    expect(anexo).not.toHaveProperty('caminho_s3');
    expect((await anexos.listarAnexosOS(osId))[0]).not.toHaveProperty('caminho_s3');
  });

  // A trava: marcar e excluir a única foto ao mesmo tempo nunca deixam o item
  // marcado sem foto — um dos dois espera o outro e recusa
  it('marcar o item e excluir a única foto dele juntos: o item marcado fica com foto', async () => {
    for (let rodada = 0; rodada < 4; rodada++) {
      await limpar();
      const { osId, fusivel } = await osEmExecucao();
      const foto = await enviar(osId, { checklist_item_id: fusivel.id });

      await Promise.allSettled([
        execucoes.atualizarChecklist(osId, { atividades: [{ id: fusivel.id, concluida: true }] }),
        anexos.removerAnexo(osId, foto.id),
      ]);

      const marcado = (await item(fusivel.id)).concluida;
      const fotos = await prisma.anexos_os.count({ where: { checklist_item_id: fusivel.id, deletado_em: null } });
      expect(marcado ? fotos : 0).toBe(marcado ? 1 : 0);
    }
  });

  it('o item que não exige foto marca sem foto', async () => {
    const { osId, limpeza } = await osEmExecucao();

    await execucoes.atualizarChecklist(osId, { atividades: [{ id: limpeza.id, concluida: true }] });

    expect((await item(limpeza.id)).concluida).toBe(true);
  });

  it('a foto do item fica presa ao item e à tarefa dele; a da tarefa, só à tarefa', async () => {
    const { osId, vinculoId, fusivel } = await osEmExecucao();

    const doItem = await enviar(osId, { checklist_item_id: fusivel.id });
    const daTarefa = await enviar(osId, { tarefa_os_id: vinculoId });
    const geral = await enviar(osId, {});

    expect(doItem).toMatchObject({ checklist_item_id: fusivel.id, tarefa_os_id: vinculoId });
    expect(daTarefa).toMatchObject({ checklist_item_id: null, tarefa_os_id: vinculoId });
    expect(geral).toMatchObject({ checklist_item_id: null, tarefa_os_id: null });

    const lista = await anexos.listarAnexosOS(osId);
    expect(lista.map((a) => a.checklist_item_id).sort()).toEqual([fusivel.id, null, null].sort());
    const daOS = (await execucoes.buscarPorId(osId)) as unknown as { anexos: Array<{ id: string; checklist_item_id: string | null }> };
    expect(daOS.anexos.find((a) => a.id === doItem.id)?.checklist_item_id).toBe(fusivel.id);
  });

  it('destino de outra OS é 404, e o arquivo não fica no disco', async () => {
    const primeira = await osEmExecucao();
    const segunda = await osEmExecucao();
    const pasta = path.join(process.cwd(), 'uploads', 'anexos-os');
    const antes = fs.existsSync(pasta) ? fs.readdirSync(pasta).length : 0;

    await expect(enviar(primeira.osId, { checklist_item_id: segunda.fusivel.id })).rejects.toBeInstanceOf(NotFoundException);
    await expect(enviar(primeira.osId, { tarefa_os_id: segunda.vinculoId })).rejects.toBeInstanceOf(NotFoundException);

    expect(fs.existsSync(pasta) ? fs.readdirSync(pasta).length : 0).toBe(antes);
  });

  it('o registro falhando, o arquivo sai do disco (não fica solto)', async () => {
    const { osId } = await osEmExecucao();
    const pasta = path.join(process.cwd(), 'uploads', 'anexos-os');
    const antes = fs.existsSync(pasta) ? fs.readdirSync(pasta).length : 0;

    // fase_execucao é VarChar(50): pelo service, sem o DTO, o create falha
    await expect(
      anexos.uploadAnexo(osId, arquivoDeTeste('fusivel.jpg'), TipoAnexoOS.FOTO_DURANTE, undefined, 'x'.repeat(60)),
    ).rejects.toBeDefined();

    expect(fs.existsSync(pasta) ? fs.readdirSync(pasta).length : 0).toBe(antes);
  });

  it('item com uma tarefa que não é a dele é 400', async () => {
    const primeira = await osEmExecucao();
    const segunda = await osEmExecucao();
    // A tarefa da mesma OS existe, mas o item tem de ser dela; aqui a tarefa é de outra OS
    await expect(enviar(primeira.osId, { checklist_item_id: primeira.fusivel.id, tarefa_os_id: segunda.vinculoId })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('a última foto do item marcado que exige foto não sai; com outra, ou desmarcado, sai', async () => {
    const { osId, fusivel } = await osEmExecucao();
    const primeira = await enviar(osId, { checklist_item_id: fusivel.id });
    await execucoes.atualizarChecklist(osId, { atividades: [{ id: fusivel.id, concluida: true }] });

    await expect(anexos.removerAnexo(osId, primeira.id)).rejects.toThrow(/Desmarque o item/);

    const segunda = await enviar(osId, { checklist_item_id: fusivel.id });
    await anexos.removerAnexo(osId, primeira.id);
    await expect(anexos.removerAnexo(osId, segunda.id)).rejects.toBeInstanceOf(ConflictException);

    await execucoes.atualizarChecklist(osId, { atividades: [{ id: fusivel.id, concluida: false }] });
    await anexos.removerAnexo(osId, segunda.id);
    expect(await prisma.anexos_os.count({ where: { checklist_item_id: fusivel.id, deletado_em: null } })).toBe(0);
  });

  it('a resposta da OS traz o "exige foto" de cada item', async () => {
    const { osId, fusivel, limpeza } = await osEmExecucao();

    const os = (await execucoes.buscarPorId(osId)) as unknown as { checklist: Array<{ id: string; exige_foto: boolean }> };
    const porId = new Map(os.checklist.map((c) => [c.id, c.exige_foto]));

    expect([porId.get(fusivel.id), porId.get(limpeza.id)]).toEqual([true, false]);
  });
});
