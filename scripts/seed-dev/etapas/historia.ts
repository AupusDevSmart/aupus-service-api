import type { Cenario } from '../cenario';
import { LinhaDoTempo } from '../linha-do-tempo';
import { as, DIA_MS, diaDaSemana, somarDias } from '../tempo';
import { marcarOcorrencias } from './ocorrencias';
import { contarHistoria } from './ordens';

/**
 * O ano de manutenção: o gerador de preventivas roda toda madrugada (o mesmo
 * service do cron, com a data simulada), o planejador monta e aprova cada
 * programação perto da data, a equipe executa, o gerente audita e o
 * planejamento finaliza. As anomalias e as solicitações acontecem no meio.
 */
export async function contarOAno(c: Cenario): Promise<LinhaDoTempo> {
  const linha = new LinhaDoTempo(c);
  let programacoes = 0;

  for (let dia = c.inicio; dia.getTime() <= c.agora.getTime(); dia = new Date(dia.getTime() + DIA_MS)) {
    const madrugada = as(dia, '03:00');
    linha.marcar(madrugada, 'gerador de preventivas', async () => {
      const resultado = await c.s.agendador.gerarProgramacoesAutomaticas({ agora: madrugada });
      if (resultado.falhas.length > 0) throw new Error(`O gerador falhou: ${JSON.stringify(resultado.falhas)}`);
      for (const criada of resultado.detalhes) {
        programacoes++;
        const p = await c.prisma.programacoes_os.findUniqueOrThrow({
          where: { id: criada.programacaoId },
          select: { planta_id: true, data_hora_programada: true },
        });
        const planta = [...c.plantas.values()].find((x) => x.id === p.planta_id?.trim());
        if (!planta) throw new Error(`Programação ${criada.codigo} sem planta do seed`);
        // O gerador sempre dá a data do ciclo: sem ela, é ele que mudou, e o seed não inventa uma
        if (!p.data_hora_programada) throw new Error(`O gerador criou a programação ${criada.codigo} sem data`);
        const data = p.data_hora_programada;
        // O planejador monta uns dez dias antes; a que nasceu atrasada, no mesmo dia
        const planejar = new Date(Math.max(as(somarDias(madrugada, 1), '09:30').getTime(), as(somarDias(data, -10), '09:30').getTime()));
        contarHistoria(c, linha, { programacaoId: criada.programacaoId.trim(), planta, tipo: 'preventiva', destino: 'normal', dia: data }, planejar);
      }
    });
  }

  // Cada um abre o sininho na segunda e na quinta de manhã: o não lido é só o dos últimos dias. Todo
  // mundo que recebe aviso, não só as pessoas do seed: o admin e o gerente que já estavam no dev
  // recebem tudo, e sem isto ficavam com um ano inteiro de avisos não lidos
  for (let dia = c.inicio; dia.getTime() <= c.agora.getTime(); dia = new Date(dia.getTime() + DIA_MS)) {
    if (![1, 4].includes(diaDaSemana(as(dia, '12:00')))) continue;
    linha.marcar(as(dia, '08:40'), 'ler as notificações', async () => {
      const comAviso = await c.prisma.notificacoes.findMany({ where: { lida: false }, distinct: ['usuario_id'], select: { usuario_id: true } });
      for (const { usuario_id } of comAviso) await c.s.sininho.marcarTodasLidas(usuario_id);
    });
  }

  marcarOcorrencias(c, linha);
  await linha.rodar();
  c.log(`  história: ${linha.feitos} acontecimentos em ${Math.round((c.agora.getTime() - c.inicio.getTime()) / DIA_MS)} dias; ${programacoes} preventivas geradas pelo cron; ${linha.adiados} passos ficam para depois de hoje`);
  return linha;
}
