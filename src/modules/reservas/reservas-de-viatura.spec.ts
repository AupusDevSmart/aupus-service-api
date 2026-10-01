import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService, PermissionScopeService } from '@/core';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { ExecucaoOSService } from '../execucao-os/execucao-os.service';
import { VeiculosService } from '../veiculos/veiculos.service';
import { ReservasService } from './reservas.service';
import { ReservasSchedulerService } from './reservas-scheduler.service';
import { disponibilidadeDasViaturas, diaDe } from './ocupacao-da-viatura';

/**
 * Reservas de viatura contra Postgres de verdade (docs/SPEC-RESERVAS-DE-VIATURA.md).
 *
 * Antes: a programação nunca checava conflito no servidor, a tela nunca via a
 * viatura ocupada, e o cron marcava a reserva "vencida" no próprio dia de uso.
 * Decisões do usuário: conflito BLOQUEIA (D1); sem hora ocupa o dia inteiro
 * (D2); a viatura só fica livre quando a OS é executada (D3); iniciar registra
 * km inicial (opcional) e marca a viatura em uso (D4).
 *
 * Roda com `npx jest --runInBand src/modules/reservas/reservas-de-viatura`.
 */
describe('reservas de viatura: conflito de horário e status pelo fluxo da OS (banco real)', () => {
  const prisma = new PrismaService();
  const scope = {
    assertEntityInScope: jest.fn(),
    assertPlantaInScope: jest.fn(),
    getScope: jest.fn().mockResolvedValue(null),
    isScoped: (s: unknown) => Array.isArray(s),
  } as unknown as PermissionScopeService;
  const programacoes = new ProgramacaoOSService(prisma, scope);
  const execucoes = new ExecucaoOSService(prisma, scope);
  const reservas = new ReservasService(prisma, new VeiculosService(prisma, scope), scope);
  const cron = new ReservasSchedulerService(prisma);

  const PREFIXO = 'TESTE-RESERVA-VIATURA';
  const PLACA = 'TST9R01';
  let veiculoId: string;

  const hoje = () => diaDe(new Date());
  const ontem = () => diaDe(new Date(Date.now() - 86_400_000));

  const limpar = async () => {
    const progs = await prisma.programacoes_os.findMany({ where: { descricao: { startsWith: PREFIXO } }, select: { id: true } });
    const ids = progs.map((p) => p.id);
    const oss = await prisma.ordens_servico.findMany({ where: { programacao_id: { in: ids } }, select: { id: true } });
    const osIds = oss.map((o) => o.id);
    await prisma.checklist_atividades_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.registros_tempo_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.historico_os.deleteMany({ where: { os_id: { in: osIds } } });
    await prisma.ordens_servico.deleteMany({ where: { id: { in: osIds } } });
    await prisma.historico_programacao_os.deleteMany({ where: { programacao_id: { in: ids } } });
    await prisma.programacoes_os.deleteMany({ where: { id: { in: ids } } });
    if (veiculoId) {
      await prisma.reserva_veiculo.deleteMany({ where: { veiculo_id: veiculoId } });
      await prisma.veiculo.update({ where: { id: veiculoId }, data: { status: 'disponivel', quilometragem: 1000 } });
    }
  };

  beforeAll(async () => {
    const antigo = await prisma.veiculo.findFirst({ where: { placa: PLACA } });
    if (antigo) {
      veiculoId = antigo.id;
      await limpar();
    } else {
      veiculoId = (
        await prisma.veiculo.create({
          data: {
            nome: 'Viatura de teste',
            placa: PLACA,
            marca: 'Teste',
            modelo: 'Furgão',
            ano_fabricacao: 2024,
            tipo: 'van',
            tipo_combustivel: 'diesel',
            localizacao_atual: 'Pátio',
            quilometragem: 1000,
          },
        })
      ).id;
    }
  });

  beforeEach(limpar);

  afterAll(async () => {
    await limpar();
    await prisma.veiculo.delete({ where: { id: veiculoId } });
    await prisma.$disconnect();
  });

  const programar = (dia: string, horaInicio: string | null, horaFim: string | null, diaFim = dia) =>
    programacoes.criar({
      descricao: `${PREFIXO} ${dia} ${horaInicio}-${horaFim}`,
      condicoes: 'PARADO',
      tipo: 'CORRETIVA',
      prioridade: 'MEDIA',
      origem: 'MANUAL',
      necessita_veiculo: true,
      veiculo_id: veiculoId,
      reserva_data_inicio: dia,
      reserva_data_fim: diaFim,
      reserva_hora_inicio: horaInicio,
      reserva_hora_fim: horaFim,
    } as never);

  const reservaDa = async (programacaoId: string) => {
    const prog = await prisma.programacoes_os.findUniqueOrThrow({ where: { id: programacaoId } });
    return prisma.reserva_veiculo.findUniqueOrThrow({ where: { id: prog.reserva_id!.trim() } });
  };

  const aprovarEIniciar = async (programacaoId: string, kmInicial?: number) => {
    await programacoes.aprovar(programacaoId, {});
    const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: programacaoId } });
    await execucoes.iniciar(os.id, { km_inicial: kmInicial } as never);
    return os.id;
  };

  describe('conflito de horário (D1: bloqueia)', () => {
    it('segunda programação com a mesma viatura no mesmo horário é recusada', async () => {
      await programar('2027-03-10', '08:00', '12:00');

      await expect(programar('2027-03-10', '10:00', '14:00')).rejects.toBeInstanceOf(ConflictException);
      expect(await prisma.programacoes_os.count({ where: { descricao: { startsWith: PREFIXO } } })).toBe(1);
    });

    it('horários encostados (12h) não conflitam', async () => {
      await programar('2027-03-10', '08:00', '12:00');
      await programar('2027-03-10', '12:00', '18:00');

      expect(await prisma.reserva_veiculo.count({ where: { veiculo_id: veiculoId, status: 'ativa' } })).toBe(2);
    });

    it('sem horário ocupa o dia inteiro (D2)', async () => {
      await programar('2027-03-10', null, null);

      await expect(programar('2027-03-10', '19:00', '20:00')).rejects.toBeInstanceOf(ConflictException);
    });

    it('reserva manual que bate com a de uma programação é recusada', async () => {
      await programar('2027-03-10', '08:00', '12:00');

      await expect(
        reservas.criar({
          veiculoId,
          tipoSolicitante: 'manual',
          dataInicio: new Date('2027-03-10'),
          dataFim: new Date('2027-03-10'),
          horaInicio: '11:00',
          horaFim: '15:00',
          responsavel: 'Teste',
          finalidade: 'Viagem',
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('editar para o horário de outra é recusado; editar sem mudar o horário passa', async () => {
      await programar('2027-03-10', '08:00', '12:00');
      const segunda = await programar('2027-03-10', '13:00', '17:00');

      await expect(
        programacoes.atualizar(segunda.id, { reserva_hora_inicio: '11:00' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(programacoes.atualizar(segunda.id, { observacoes: 'só texto' } as never)).resolves.toBeDefined();
    });

    it('editar não ressuscita reserva cancelada: cria outra, checando conflito', async () => {
      const prog = await programar('2027-03-10', '08:00', '12:00');
      const antiga = await reservaDa(prog.id);
      await prisma.reserva_veiculo.update({ where: { id: antiga.id }, data: { status: 'cancelada' } });

      await programacoes.atualizar(prog.id, { reserva_hora_fim: '13:00' } as never);

      expect((await prisma.reserva_veiculo.findUniqueOrThrow({ where: { id: antiga.id } })).status).toBe('cancelada');
      const nova = await reservaDa(prog.id);
      expect(nova.id).not.toBe(antiga.id);
      expect(nova).toMatchObject({ status: 'ativa', hora_fim: '13:00' });
    });

    it('data vazia na edição não vira 1970', async () => {
      const prog = await programar('2027-03-10', '08:00', '12:00');

      await programacoes.atualizar(prog.id, { data_hora_programada: null } as never);

      const salva = await prisma.programacoes_os.findUniqueOrThrow({ where: { id: prog.id } });
      expect(salva.data_hora_programada).toBeNull();
      expect(diaDe((await reservaDa(prog.id)).data_inicio)).toBe('2027-03-10');
    });
  });

  describe('aprovar', () => {
    it('com nova data, a reserva vai junto (mesma duração)', async () => {
      const prog = await programar('2027-03-10', '08:00', '12:00');

      await programacoes.aprovar(prog.id, { data_programada_sugerida: '2027-03-12', hora_programada_sugerida: '09:00' } as never);

      const reserva = await reservaDa(prog.id);
      expect(diaDe(reserva.data_inicio)).toBe('2027-03-12');
      expect(reserva).toMatchObject({ hora_inicio: '09:00', hora_fim: '13:00', tipo_solicitante: 'ordem_servico' });
      // hora sugerida em Brasília, não em UTC
      const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });
      expect(os.data_hora_programada?.toISOString()).toBe('2027-03-12T12:00:00.000Z');
    });

    it('nova data que bate com outra reserva é recusada', async () => {
      const prog = await programar('2027-03-10', '08:00', '12:00');
      await programar('2027-03-12', '10:00', '11:00');

      await expect(
        programacoes.aprovar(prog.id, { data_programada_sugerida: '2027-03-12', hora_programada_sugerida: '09:00' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await prisma.programacoes_os.findUniqueOrThrow({ where: { id: prog.id } })).status).toBe('PENDENTE');
    });
  });

  describe('execução (D3/D4)', () => {
    it('iniciar registra o km inicial e põe a viatura em uso; executar devolve com o km final', async () => {
      const prog = await programar('2027-03-10', '08:00', '12:00');
      const osId = await aprovarEIniciar(prog.id, 1200);

      expect(await reservaDa(prog.id)).toMatchObject({ status: 'ativa', km_inicial: 1200 });
      expect((await prisma.veiculo.findUniqueOrThrow({ where: { id: veiculoId } })).status).toBe('em_uso');

      await execucoes.executar(osId, { resultado_servico: 'ok', km_final: 1260 } as never);

      expect(await reservaDa(prog.id)).toMatchObject({ status: 'finalizada', km_final: 1260 });
      const veiculo = await prisma.veiculo.findUniqueOrThrow({ where: { id: veiculoId } });
      expect(veiculo).toMatchObject({ status: 'disponivel', quilometragem: 1260 });
    });

    it('km final menor que o inicial é recusado', async () => {
      const prog = await programar('2027-03-10', '08:00', '12:00');
      const osId = await aprovarEIniciar(prog.id, 1200);

      await expect(
        execucoes.executar(osId, { resultado_servico: 'ok', km_final: 1100 } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('OS em execução depois do horário reservado continua prendendo a viatura agora', async () => {
      const prog = await programar(ontem(), '08:00', '12:00');
      await aprovarEIniciar(prog.id);

      const janelaDeHoje = { data_inicio: hoje(), data_fim: hoje() };
      const [viatura] = (await disponibilidadeDasViaturas(prisma, janelaDeHoje)).filter((v) => v.id === veiculoId);
      expect(viatura.disponivel).toBe(false);
    });

    it('OS que nem começou não prende a viatura depois do horário dela', async () => {
      const prog = await programar(ontem(), '08:00', '12:00');
      await programacoes.aprovar(prog.id, {});

      const [viatura] = (await disponibilidadeDasViaturas(prisma, { data_inicio: hoje(), data_fim: hoje() })).filter(
        (v) => v.id === veiculoId,
      );
      expect(viatura.disponivel).toBe(true);
    });

    it('cancelar a OS cancela a reserva e devolve a viatura', async () => {
      const prog = await programar('2027-03-10', '08:00', '12:00');
      await programacoes.aprovar(prog.id, {});
      const os = await prisma.ordens_servico.findUniqueOrThrow({ where: { programacao_id: prog.id } });

      await execucoes.cancelar(os.id, { motivo_cancelamento: 'Desistiu' } as never);

      expect((await reservaDa(prog.id)).status).toBe('cancelada');
      expect((await prisma.veiculo.findUniqueOrThrow({ where: { id: veiculoId } })).status).toBe('disponivel');
    });
  });

  describe('disponibilidade e vencimento', () => {
    it('mostra a viatura ocupada no horário, com o motivo; livre quando é a própria reserva', async () => {
      const prog = await programar('2027-03-10', '08:00', '12:00');
      const reserva = await reservaDa(prog.id);
      const janela = { data_inicio: '2027-03-10', data_fim: '2027-03-10', hora_inicio: '09:00', hora_fim: '10:00' };

      const [ocupada] = (await disponibilidadeDasViaturas(prisma, janela)).filter((v) => v.id === veiculoId);
      const [propria] = (await disponibilidadeDasViaturas(prisma, janela, reserva.id)).filter((v) => v.id === veiculoId);

      expect(ocupada.disponivel).toBe(false);
      expect(ocupada.motivo).toContain('10/03 08:00');
      expect(propria.disponivel).toBe(true);
    });

    it('cron só vence reserva manual cujo horário já acabou; a de OS espera a execução', async () => {
      const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);
      const base = { veiculo_id: veiculoId, responsavel: 'Teste', finalidade: 'x', hora_inicio: '00:00', hora_fim: '23:59' };
      const manualOntem = await prisma.reserva_veiculo.create({
        data: { ...base, tipo_solicitante: 'manual', data_inicio: dia(ontem()), data_fim: dia(ontem()) },
      });
      const manualHoje = await prisma.reserva_veiculo.create({
        data: { ...base, tipo_solicitante: 'manual', data_inicio: dia(hoje()), data_fim: dia(hoje()) },
      });
      const daOS = await prisma.reserva_veiculo.create({
        data: { ...base, tipo_solicitante: 'ordem_servico', data_inicio: dia(ontem()), data_fim: dia(ontem()) },
      });

      await cron.marcarReservasVencidas();

      const status = async (id: string) => (await prisma.reserva_veiculo.findUniqueOrThrow({ where: { id } })).status;
      expect(await status(manualOntem.id)).toBe('vencida');
      expect(await status(manualHoje.id)).toBe('ativa');
      expect(await status(daOS.id)).toBe('ativa');
    });
  });
});
