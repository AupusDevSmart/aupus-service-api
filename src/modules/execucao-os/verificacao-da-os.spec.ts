import * as fs from 'fs';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, PermissionScopeService, TipoAnexoOS } from '@/core';
import { ExecucaoOSService } from './execucao-os.service';
import { AnexosOSService } from './anexos-os.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { arquivoDeTeste } from '../../../test/arquivo-de-teste';
import { codigoDigitado, codigoDoConteudo, conteudoDaOS, jsonCanonico, type ConteudoDaOS } from './conteudo-da-os';
import { anexosQueMudaram } from './verificacao-da-os';

const REFERENCIA = '6206796c6cee2ff9b551af7aab54b6e8713877cd7b3764f55efd2a6bfe673324';

/**
 * Código de verificação da OS finalizada (SN-62). A finalização grava o
 * conteúdo registrado e o SHA-256 dele; o PDF sai dessa cópia; conferir refaz a
 * conta sobre o que está no sistema e diz em que mudou.
 */
describe('código de verificação (regra)', () => {
  it('o JSON canônico ordena as chaves em todo nível e ignora o indefinido', () => {
    expect(jsonCanonico({ b: 1, a: { d: [2, { z: 1, y: null }], c: 'x', e: undefined } })).toBe('{"a":{"c":"x","d":[2,{"y":null,"z":1}]},"b":1}');
  });

  // Referência fixa: mudar o JSON canônico ou o hash muda o código de toda OS
  // finalizada. Se este teste quebrar, é preciso uma versão nova do conteúdo
  // (VERSAO_DO_CONTEUDO) com a conta da antiga mantida — não trocar o número
  it('o código de um conteúdo fixo não muda', () => {
    const fixo = {
      versao: 1,
      os: { numero_os: 'OS-1', resultado_servico: 'Feito', custo_real: 234.5, finalizada_em: '2026-10-17T12:00:00.000Z' },
      tarefas: [{ id: 'T1', status: 'CONCLUIDA' }],
      checklist: [{ id: 'C1', valor_lido: 601.25, concluida: true }],
      anexos: [{ id: 'A1', sha256: 'f'.repeat(64), tamanho: 10 }],
      equipe: [],
      materiais: [],
      ferramentas: [],
    } as unknown as ConteudoDaOS;
    expect(codigoDoConteudo(fixo)).toBe(REFERENCIA);
  });

  it('cada anexo que mudou, um por um', () => {
    const anexo = (id: string, sha256: string | null) => ({ id, nome_original: `${id}.jpg`, sha256 }) as ConteudoDaOS['anexos'][number];
    expect(
      anexosQueMudaram(
        [anexo('igual', 'a'), anexo('trocado', 'a'), anexo('sumiu', 'a'), anexo('excluido', 'a'), anexo('voltou', null)],
        [anexo('igual', 'a'), anexo('trocado', 'b'), anexo('sumiu', null), anexo('voltou', 'c'), anexo('novo', 'd')],
      ),
    ).toEqual([
      'trocado.jpg: o arquivo é diferente do registrado',
      'sumiu.jpg: o arquivo não está no servidor',
      'excluido.jpg: excluído depois da finalização',
      'voltou.jpg: não estava no servidor na finalização',
      'novo.jpg: acrescentado depois da finalização',
    ]);
  });

  it('o código colado com espaços, traços e maiúsculas vale; o resto não', () => {
    const codigo = 'ab12'.repeat(16);
    const agrupado = codigo.toUpperCase().match(/.{8}/g)!.join(' - ');
    expect(codigoDigitado(agrupado)).toBe(codigo);
    expect(codigoDigitado(codigo.slice(1))).toBeNull();
    expect(codigoDigitado(`${codigo.slice(1)}g`)).toBeNull();
    expect(codigoDigitado(undefined)).toBeNull();
  });
});

describe('código de verificação ao finalizar a OS (banco real)', () => {
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
  const PREFIXO = 'TESTE-CODIGO-OS';
  const arquivosCriados: string[] = [];
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const limpar = async () => {
    const ids = (await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
    const osIds = (await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } })).map((o) => o.id);
    await prisma.registros_tempo_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.notificacoes_eventos.deleteMany({ where: { entidade_id: { in: [...ids, ...osIds].map((i) => i.trim()) } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: osIds } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
    for (const caminho of arquivosCriados.splice(0)) if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
  };

  beforeAll(async () => {
    await limpar();
    planta = await criarPlantaDeTeste(prisma, 'codigoos', '95.000.000/0001-62');
  });
  beforeEach(async () => {
    await limpar();
    (scope.assertEntityInScope as jest.Mock).mockReset();
  });
  afterAll(async () => {
    await limpar();
    await planta.apagar();
    await prisma.$disconnect();
  });

  const sha256 = (dados: Buffer) => createHash('sha256').update(dados).digest('hex');

  /** OS executada com uma foto; `auditar` a leva até auditada. */
  const osExecutada = async (auditar = true) => {
    const prog = await programacoes.criar({
      descricao: `${PREFIXO} preventiva`,
      condicoes: 'FUNCIONANDO',
      tipo: 'PREVENTIVA',
      prioridade: 'MEDIA',
      ...(await planta.origem()),
      planta_id: planta.id,
    } as never);
    await programacoes.aprovar(prog.id, {});
    const { id: osId } = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await execucoes.iniciar(osId, {} as never);
    const foto = await anexos.uploadAnexo(osId, arquivoDeTeste('painel.jpg', 'image/jpeg'), TipoAnexoOS.FOTO_DURANTE);
    const caminho = (await prisma.anexos_os.findUniqueOrThrow({ where: { id: foto.id } })).caminho_s3;
    arquivosCriados.push(caminho);
    await execucoes.executar(osId, { resultado_servico: 'Painel limpo e reapertado' } as never);
    if (auditar) await execucoes.auditar(osId, { avaliacao_qualidade: 4 } as never);
    return { osId, caminho };
  };

  const osFinalizada = async () => {
    const os = await osExecutada();
    await execucoes.finalizar(os.osId, {} as never);
    const { codigo_verificacao } = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: os.osId } });
    return { ...os, codigo: codigo_verificacao! };
  };

  it('o upload grava a soma do arquivo', async () => {
    const { osId, caminho } = await osExecutada(false);
    const anexo = await prisma.anexos_os.findFirstOrThrow({ where: { os_id: osId } });
    expect(anexo.sha256).toBe(sha256(fs.readFileSync(caminho)));
  });

  it('antes de executar não há relatório; executada, prévia sem código, com a soma da foto', async () => {
    const prog = await programacoes.criar({
      descricao: `${PREFIXO} pendente`,
      condicoes: 'FUNCIONANDO',
      tipo: 'PREVENTIVA',
      prioridade: 'MEDIA',
      ...(await planta.origem()),
      planta_id: planta.id,
    } as never);
    await programacoes.aprovar(prog.id, {});
    const pendente = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    await expect(execucoes.relatorio(pendente.id)).rejects.toBeInstanceOf(ConflictException);

    const { osId, caminho } = await osExecutada(false);
    const relatorio = await execucoes.relatorio(osId);

    expect(relatorio).toMatchObject({ status: 'EXECUTADA', previa: true, codigo: null });
    expect(relatorio.conteudo.os.resultado_servico).toBe('Painel limpo e reapertado');
    expect(relatorio.conteudo.anexos[0]).toMatchObject({ nome_original: 'painel.jpg', sha256: sha256(fs.readFileSync(caminho)) });
  });

  it('finalizar grava o conteúdo, a data e o código dele; o relatório sai da cópia, com o código', async () => {
    const { osId, codigo } = await osFinalizada();
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: osId } });

    expect(codigo).toMatch(/^[0-9a-f]{64}$/);
    expect(os.finalizada_em).not.toBeNull();
    // O código é o SHA-256 do conteúdo canônico — também depois de passar pelo JSONB
    expect(codigoDoConteudo(os.conteudo_finalizado as unknown as ConteudoDaOS)).toBe(codigo);
    expect(codigoDoConteudo(await conteudoDaOS(prisma, osId))).toBe(codigo);

    const relatorio = await execucoes.relatorio(osId);
    expect(relatorio).toMatchObject({ status: 'FINALIZADA', previa: false, codigo, finalizada_em: os.finalizada_em!.toISOString() });
    expect(relatorio.conteudo.os.finalizada_em).toBe(os.finalizada_em!.toISOString());
  });

  it('conferir: nada mudou, confere — com o código colado em grupos e maiúsculas', async () => {
    const { osId, codigo } = await osFinalizada();

    const conferencia = await execucoes.conferirCodigo(codigo.toUpperCase().match(/.{8}/g)!.join(' '));

    expect(conferencia).toMatchObject({ os_id: osId.trim(), confere: true, diferencas: [] });
  });

  it('mudou um texto da OS: não confere e diz em quê', async () => {
    const { osId, codigo } = await osFinalizada();
    await prisma.ordens_servico.update({ where: { id: osId }, data: { resultado_servico: 'Outro resultado' } });

    expect(await execucoes.conferirCodigo(codigo)).toMatchObject({
      confere: false,
      diferencas: ['dados da OS (resultado, falha, auditoria, datas)'],
    });
  });

  // SN-60 (19/out/2026): a chave nova não pode mudar o código das OS sem resposta
  it('"parou?" sem resposta fica fora do conteúdo; respondida depois, não confere', async () => {
    const { osId, codigo } = await osFinalizada();
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: osId } });
    expect((os.conteudo_finalizado as unknown as ConteudoDaOS).os).not.toHaveProperty('equipamento_parou');

    await prisma.ordens_servico.update({ where: { id: osId }, data: { equipamento_parou: false } });

    expect(await execucoes.conferirCodigo(codigo)).toMatchObject({ confere: false, diferencas: ['dados da OS (resultado, falha, auditoria, datas)'] });
  });

  it('trocou ou sumiu o arquivo da foto: não confere (fotos e documentos)', async () => {
    const { codigo, caminho } = await osFinalizada();

    fs.writeFileSync(caminho, Buffer.concat([fs.readFileSync(caminho), Buffer.from('x')]));
    expect(await execucoes.conferirCodigo(codigo)).toMatchObject({
      confere: false,
      diferencas: ['fotos e documentos'],
      anexos: ['painel.jpg: o arquivo é diferente do registrado'],
    });

    fs.unlinkSync(caminho);
    expect(await execucoes.conferirCodigo(codigo)).toMatchObject({ confere: false, anexos: ['painel.jpg: o arquivo não está no servidor'] });
  });

  it('mexer na cópia guardada também é pego', async () => {
    const { osId, codigo } = await osFinalizada();
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: osId } });
    const copia = os.conteudo_finalizado as unknown as ConteudoDaOS;
    await prisma.ordens_servico.update({
      where: { id: osId },
      data: { conteudo_finalizado: { ...copia, os: { ...copia.os, resultado_servico: 'Adulterado' } } as never },
    });

    const conferencia = await execucoes.conferirCodigo(codigo);
    expect(conferencia.confere).toBe(false);
    expect(conferencia.diferencas).toContain('a cópia guardada na finalização');
    // E o PDF não sai da cópia mexida com o código original
    await expect(execucoes.relatorio(osId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('a resposta do relatório não leva o custo unitário (a cópia gravada leva: é ela que o código prova)', async () => {
    const { osId } = await osExecutada();
    await prisma.ordens_servico.update({ where: { id: osId }, data: { status: 'AUDITADA' } });
    await prisma.materiais_os.create({ data: { os_id: osId, descricao: 'Graxa', quantidade_planejada: 1, unidade: 'UN', custo_unitario: 12.5 } });

    const previa = await execucoes.relatorio(osId);

    expect(previa.conteudo.materiais[0]).toMatchObject({ descricao: 'Graxa' });
    expect(previa.conteudo.materiais[0]).not.toHaveProperty('custo_unitario');
  });

  it('anexo sem arquivo ao finalizar: entra sem soma e a trilha diz qual', async () => {
    const { osId } = await osExecutada();
    await prisma.anexos_os.create({
      data: { os_id: osId, nome: 'x', nome_original: 'antiga.jpg', tipo: 'FOTO_DEPOIS', mime_type: 'image/jpeg', tamanho: 1, caminho_s3: 'C:/nao/existe/antiga.jpg' },
    });

    await execucoes.finalizar(osId, {} as never);

    const relatorio = await execucoes.relatorio(osId);
    expect(relatorio.conteudo.anexos.find((a) => a.nome_original === 'antiga.jpg')?.sha256).toBeNull();
    const trilha = await prisma.historico_os.findFirst({ where: { os_id: osId, acao: 'ANEXO_SEM_ARQUIVO' } });
    expect(trilha?.observacoes).toContain('antiga.jpg');
  });

  // Revisão de banco: o upload lia o status sem trava e gravava depois do conteúdo
  // do finalizar — a OS finalizada ficava com um anexo fora do código
  it('foto enviada junto com o "Finalizar": ou entra no conteúdo, ou é recusada', async () => {
    const { osId } = await osExecutada();

    const [, envio] = await Promise.allSettled([
      execucoes.finalizar(osId, {} as never),
      anexos.uploadAnexo(osId, arquivoDeTeste('ultima.jpg', 'image/jpeg'), TipoAnexoOS.FOTO_DEPOIS),
    ]);
    if (envio.status === 'fulfilled') {
      arquivosCriados.push((await prisma.anexos_os.findUniqueOrThrow({ where: { id: envio.value.id } })).caminho_s3);
    } else {
      expect(envio.reason).toBeInstanceOf(ConflictException);
    }

    const { codigo_verificacao } = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: osId } });
    expect((await execucoes.conferirCodigo(codigo_verificacao!)).confere).toBe(true);
  });

  it('reabrir junto com o "Finalizar": um só vence, e a OS não fica em execução com código', async () => {
    const { osId } = await osExecutada();

    const resultados = await Promise.allSettled([execucoes.finalizar(osId, {} as never), execucoes.reabrir(osId, {} as never)]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { id: osId } });
    expect(os.status === 'FINALIZADA').toBe(!!os.codigo_verificacao);
  });

  it('código fora do escopo, inexistente ou malformado', async () => {
    const { codigo } = await osFinalizada();
    const deOutraPlanta = { id: 'cliente', plantas: [] } as never;

    (scope.assertEntityInScope as jest.Mock).mockRejectedValueOnce(new NotFoundException('Ordem de serviço não encontrada'));
    await expect(execucoes.conferirCodigo(codigo, deOutraPlanta)).rejects.toBeInstanceOf(NotFoundException);
    await expect(execucoes.conferirCodigo('f'.repeat(64))).rejects.toBeInstanceOf(NotFoundException);
    await expect(execucoes.conferirCodigo('123')).rejects.toBeInstanceOf(BadRequestException);
  });

  // O escopo real recusa a OS de outra planta com 404, igual à que não existe (SN-57)
  it('o relatório confere o escopo de quem pede', async () => {
    const { osId } = await osExecutada(false);
    (scope.assertEntityInScope as jest.Mock).mockRejectedValueOnce(new NotFoundException('Ordem de serviço não encontrada'));

    await expect(execucoes.relatorio(osId, { id: 'x' } as never)).rejects.toThrow('Ordem de serviço não encontrada');
  });

  // Já existia: dois "Finalizar" juntos passavam os dois e contavam a execução das tarefas duas vezes
  it('dois "Finalizar" juntos: um passa, o outro é recusado', async () => {
    const { osId } = await osExecutada();

    const resultados = await Promise.allSettled([execucoes.finalizar(osId, {} as never), execucoes.finalizar(osId, {} as never)]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(await prisma.historico_os.count({ where: { os_id: osId, acao: 'FINALIZACAO' } })).toBe(1);
  });

  it('OS finalizada antes do código existir: o relatório é o conteúdo de agora, sem código', async () => {
    const { osId } = await osFinalizada();
    // DbNull: o null do JS num campo Json grava o JSON `null`, e a trava do banco (os dois juntos) recusa
    await prisma.ordens_servico.update({ where: { id: osId }, data: { codigo_verificacao: null, conteudo_finalizado: Prisma.DbNull } });

    expect(await execucoes.relatorio(osId)).toMatchObject({ status: 'FINALIZADA', previa: false, codigo: null });
  });
});
