import * as fs from 'fs';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService, PermissionScopeService, StatusOS, TipoAnexoOS } from '@/core';
import { ExecucaoOSService } from './execucao-os.service';
import { AnexosOSService } from './anexos-os.service';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { criarPlantaDeTeste } from '../../../test/planta-de-teste';
import { arquivoDeTeste } from '../../../test/arquivo-de-teste';

/**
 * A OS como registro: o que entra nela (anexos, consumo de material, uso de
 * ferramenta) fica preso à OS certa, só por quem enxerga a planta, e congela
 * quando a OS é finalizada ou cancelada (SN-22, SN-23). Contra Postgres real.
 */
describe('trava e anexos da OS (banco real)', () => {
  const prisma = new PrismaService();
  const FORA_DO_ESCOPO = 'usuario-fora-do-escopo';
  const scope = {
    assertEntityInScope: jest.fn(async (_tipo: string, _id: string, user: { id: string }) => {
      // Como o escopo real desde o SN-57: fora do escopo é 404, igual ao que não existe
      if (user?.id === FORA_DO_ESCOPO) throw new NotFoundException('Ordem de serviço não encontrada');
    }),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);
  const anexos = new AnexosOSService(prisma, scope);

  const PREFIXO = 'TESTE-TRAVA-OS';
  const AUTOR = 'testetravaautor00000000001';
  const autor = { id: AUTOR, role: 'operador', permissions: ['execucao_os.executar'] };
  const fora = { id: FORA_DO_ESCOPO, role: 'operador', permissions: ['execucao_os.executar'] };
  const arquivosCriados: string[] = [];
  let planta: Awaited<ReturnType<typeof criarPlantaDeTeste>>;

  const foto = (nome = 'mancal.jpg') => arquivoDeTeste(nome, 'image/jpeg');
  // O caminho no disco não está mais na resposta (revisão do SN-59): vem do banco
  const caminhoDe = async (anexoId: string) => (await prisma.anexos_os.findUniqueOrThrow({ where: { id: anexoId } })).caminho_s3;

  const limpar = async () => {
    const progs = await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } });
    const ids = progs.map((p) => p.id);
    const oss = await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } });
    const osIds = oss.map((o) => o.id);
    await prisma.anexos_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.materiais_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.ferramentas_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.checklist_atividades_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.registros_tempo_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.tarefas_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: osIds } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.tarefas_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    await limpar();
    planta = await criarPlantaDeTeste(prisma, 'travaos', '95.000.000/0001-01');
    await prisma.usuarios.upsert({
      where: { id: AUTOR },
      update: { nome: 'Técnico da Trava', deleted_at: null },
      create: { id: AUTOR, nome: 'Técnico da Trava', email: 'autor@trava-os.teste', role: 'operador' },
    });
  });
  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    for (const caminho of arquivosCriados) if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    await prisma.usuarios.deleteMany({ where: { id: AUTOR } });
    await planta.apagar();
    await prisma.$disconnect();
  });

  /** Uma OS aprovada, com um material e uma ferramenta planejados. */
  const novaOS = async (rotulo = 'A') => {
    const prog = await programacoes.criar({
      descricao: `${PREFIXO} ${rotulo}`,
      condicoes: 'FUNCIONANDO',
      tipo: 'CORRETIVA',
      prioridade: 'MEDIA',
      ...(await planta.origem()),
      planta_id: planta.id,
    } as never);
    await programacoes.aprovar(prog.id, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
    const material = await prisma.materiais_os.create({
      data: { os_id: os.id, descricao: 'Graxa', quantidade_planejada: 1, unidade: 'kg' },
    });
    const ferramenta = await prisma.ferramentas_os.create({ data: { os_id: os.id, descricao: 'Chave de torque' } });
    return { osId: os.id, materialId: material.id, ferramentaId: ferramenta.id };
  };

  const comStatus = (osId: string, status: StatusOS) =>
    prisma.ordens_servico.update({ where: { id: osId }, data: { status } });

  const enviar = async (osId: string, tipo: TipoAnexoOS = TipoAnexoOS.FOTO_ANTES, nome?: string) => {
    const anexo = await anexos.uploadAnexo(osId, foto(nome), tipo, 'Antes da troca', undefined, autor);
    arquivosCriados.push(await caminhoDe(anexo.id));
    return anexo;
  };

  describe('trava da OS finalizada ou cancelada (SN-23)', () => {
    it('OS finalizada não aceita consumo de material', async () => {
      const { osId, materialId } = await novaOS();
      await comStatus(osId, StatusOS.FINALIZADA);

      await expect(
        execucoes.registrarMateriais(osId, { materiais: [{ id: materialId, quantidade_consumida: 2 }] } as never, AUTOR, autor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('OS cancelada não aceita uso de ferramenta', async () => {
      const { osId, ferramentaId } = await novaOS();
      await comStatus(osId, StatusOS.CANCELADA);

      await expect(
        execucoes.registrarFerramentas(osId, { ferramentas: [{ id: ferramentaId, utilizada: true }] } as never, AUTOR, autor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('o material de outra OS não é alterado pelo id', async () => {
      const a = await novaOS('A');
      const b = await novaOS('B');

      await expect(
        execucoes.registrarMateriais(a.osId, { materiais: [{ id: b.materialId, quantidade_consumida: 9 }] } as never, AUTOR, autor),
      ).rejects.toBeInstanceOf(NotFoundException);
      const daOutra = await prisma.materiais_os.findUniqueOrThrow({ where: { id: b.materialId } });
      expect(daOutra.quantidade_consumida).toBeNull();
    });

    it('a ferramenta de outra OS também não', async () => {
      const a = await novaOS('A');
      const b = await novaOS('B');

      await expect(
        execucoes.registrarFerramentas(a.osId, { ferramentas: [{ id: b.ferramentaId, utilizada: true }] } as never, AUTOR, autor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('quem não enxerga a planta não registra material', async () => {
      const { osId, materialId } = await novaOS();

      await expect(
        execucoes.registrarMateriais(osId, { materiais: [{ id: materialId, quantidade_consumida: 2 }] } as never, FORA_DO_ESCOPO, fora),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('em execução o consumo grava normalmente', async () => {
      const { osId, materialId } = await novaOS();
      await comStatus(osId, StatusOS.EM_EXECUCAO);

      await execucoes.registrarMateriais(osId, { materiais: [{ id: materialId, quantidade_consumida: 2 }] } as never, AUTOR, autor);

      const m = await prisma.materiais_os.findUniqueOrThrow({ where: { id: materialId } });
      expect(Number(m.quantidade_consumida)).toBe(2);
    });
  });

  describe('anexos (SN-22)', () => {
    it('o envio grava quem enviou, o tipo e a descrição', async () => {
      const { osId } = await novaOS();

      const anexo = await enviar(osId);

      const salvo = await prisma.anexos_os.findUniqueOrThrow({ where: { id: anexo.id } });
      expect(salvo).toMatchObject({
        tipo: TipoAnexoOS.FOTO_ANTES,
        descricao: 'Antes da troca',
        uploaded_by: 'Técnico da Trava',
      });
      expect(salvo.uploaded_by_id?.trim()).toBe(AUTOR);
      expect(fs.existsSync(salvo.caminho_s3)).toBe(true);
    });

    it('foto do celular (heic, webp) é aceita; executável não', async () => {
      const { osId } = await novaOS();

      await expect(enviar(osId, TipoAnexoOS.FOTO_DURANTE, 'IMG_0001.HEIC')).resolves.toBeDefined();
      await expect(enviar(osId, TipoAnexoOS.FOTO_DEPOIS, 'foto.webp')).resolves.toBeDefined();
      await expect(enviar(osId, TipoAnexoOS.DOCUMENTO, 'programa.exe')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tipo de anexo fora da lista é recusado', async () => {
      const { osId } = await novaOS();

      await expect(anexos.uploadAnexo(osId, foto(), 'SELFIE' as TipoAnexoOS, undefined, undefined, autor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('OS finalizada não aceita anexo novo nem exclusão', async () => {
      const { osId } = await novaOS();
      const anexo = await enviar(osId);
      await comStatus(osId, StatusOS.FINALIZADA);

      await expect(enviar(osId)).rejects.toBeInstanceOf(ConflictException);
      await expect(anexos.removerAnexo(osId, anexo.id, autor)).rejects.toBeInstanceOf(ConflictException);
    });

    it('excluir é lógico: some da lista, mas o arquivo continua no disco', async () => {
      const { osId } = await novaOS();
      const anexo = await enviar(osId);

      await anexos.removerAnexo(osId, anexo.id, autor);

      expect(await anexos.listarAnexosOS(osId, autor)).toHaveLength(0);
      expect(fs.existsSync(await caminhoDe(anexo.id))).toBe(true);
    });

    it('o anexo de uma OS não é encontrado pela outra', async () => {
      const a = await novaOS('A');
      const b = await novaOS('B');
      const anexoDeA = await enviar(a.osId);

      await expect(anexos.buscarAnexo(b.osId, anexoDeA.id, autor)).rejects.toBeInstanceOf(NotFoundException);
      await expect(anexos.removerAnexo(b.osId, anexoDeA.id, autor)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('quem não enxerga a planta não lista, não baixa e não envia', async () => {
      const { osId } = await novaOS();
      const anexo = await enviar(osId);

      await expect(anexos.listarAnexosOS(osId, fora)).rejects.toBeInstanceOf(NotFoundException);
      await expect(anexos.obterCaminhoArquivo(osId, anexo.id, fora)).rejects.toBeInstanceOf(NotFoundException);
      await expect(anexos.uploadAnexo(osId, foto(), TipoAnexoOS.FOTO_ANTES, undefined, undefined, fora)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('a lista vem com os tipos para a tela separar antes, durante e depois', async () => {
      const { osId } = await novaOS();
      await enviar(osId, TipoAnexoOS.FOTO_ANTES);
      await enviar(osId, TipoAnexoOS.FOTO_DEPOIS);

      const lista = await anexos.listarAnexosOS(osId, autor);
      expect(lista.map((a) => a.tipo).sort()).toEqual([TipoAnexoOS.FOTO_ANTES, TipoAnexoOS.FOTO_DEPOIS]);
    });
  });
});
