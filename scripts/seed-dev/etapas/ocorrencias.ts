import { CreateAnomaliaDto } from '@/modules/anomalias/dto/create-anomalia.dto';
import { CancelarProgramacaoDto, CreateProgramacaoAnomaliaDto } from '@/modules/programacao-os/dto/programacao-actions.dto';
import { CreateReservaDto } from '@/modules/reservas/dto/create-reserva.dto';
import { CreateSolicitacaoDto } from '@/modules/solicitacoes-servico/dto/create-solicitacao.dto';
import { validar } from '../ambiente';
import { type Cenario, equipamento, idDe, pessoa } from '../cenario';
import { RESERVAS_AVULSAS } from '../dados/agenda';
import { ANOMALIAS, SOLICITACOES, type AnomaliaDoSeed, type SolicitacaoDoSeed } from '../dados/ocorrencias';
import { arquivoDaFoto, fotoDeExemplo } from '../foto';
import type { LinhaDoTempo } from '../linha-do-tempo';
import { as, diaDe, instante, somarDias, somarHoras } from '../tempo';
import { contarHistoria, type Destino } from './ordens';

/** Quanto a equipe demora para programar a corretiva, pela prioridade */
const HORAS_ATE_PROGRAMAR: Record<AnomaliaDoSeed['prioridade'], number> = { CRITICA: 0.25, ALTA: 1, MEDIA: 20, BAIXA: 44 };

function quandoAconteceu(c: Cenario, diasAtras: number, hora: string): Date {
  const inteiro = Math.floor(diasAtras);
  const fracao = diasAtras - inteiro;
  const base = as(somarDias(c.agora, -inteiro), hora);
  return fracao > 0 ? somarHoras(base, -fracao * 24) : base;
}

function anomalia(c: Cenario, linha: LinhaDoTempo, a: AnomaliaDoSeed): void {
  const quando = quandoAconteceu(c, a.diasAtras, a.hora);
  linha.marcar(quando, `anomalia ${a.equipamento}`, async () => {
    const e = equipamento(c, a.planta, a.unidade, a.equipamento);
    const autor = pessoa(c, a.por);
    const criada = await c.s.anomalias.create(
      await validar(
        CreateAnomaliaDto,
        {
          descricao: a.descricao,
          localizacao: { equipamentoId: e.id, local: `${e.planta.nome} — ${e.unidade.nome}`, ativo: e.nome },
          condicao: a.condicao,
          origem: a.origem,
          prioridade: a.prioridade,
          prazo: instante(somarHoras(quando, a.prioridade === 'CRITICA' ? 8 : a.prioridade === 'ALTA' ? 48 : 240)),
          ...(a.instrucoes.length > 0 && { instrucoes_ids: a.instrucoes.map((cod) => idDe(c.instrucoes, cod, 'Instrução')) }),
        },
        `anomalia ${a.equipamento}`,
      ),
      autor.usuario,
    );
    const anomaliaId = criada.id.trim();
    if (a.origem === 'OPERADOR') {
      const conteudo = fotoDeExemplo('defeito', `${e.nome}: ${a.descricao}`);
      await c.s.anexosDaAnomalia.uploadAnexo(anomaliaId, arquivoDaFoto(`anomalia-${diaDe(quando)}.png`, conteudo) as Express.Multer.File, 'Foto tirada no registro', autor.id);
    }
    if (a.desfecho === 'aberta') return;

    const planejadora = pessoa(c, 'renata');
    const programarEm = somarHoras(quando, HORAS_ATE_PROGRAMAR[a.prioridade]);
    linha.marcar(programarEm, `programar corretiva ${a.equipamento}`, async () => {
      const programacao = await c.s.programacoes.criarDeAnomalia(
        anomaliaId,
        await validar(
          CreateProgramacaoAnomaliaDto,
          { ajustes: { descricao: `Corretiva: ${a.descricao}`.slice(0, 500), prioridade: a.prioridade, tempo_estimado: a.parouHoras ? Math.min(a.parouHoras, 24) : 4 } },
          'programar corretiva',
        ),
        planejadora.id,
        planejadora.usuario,
      );
      const programacaoId = programacao.id.trim();
      if (a.desfecho === 'cancelada') {
        linha.marcar(somarHoras(c.relogio.passoEmCurso()!, 26), `cancelar corretiva ${a.equipamento}`, async () => {
          await c.s.programacoes.cancelar(
            programacaoId,
            await validar(CancelarProgramacaoDto, { motivo_cancelamento: 'A comunicação voltou sozinha: era falha da operadora de internet do cliente' }, 'cancelar corretiva'),
            planejadora.id,
            planejadora.usuario,
          );
        });
        return;
      }
      const urgente = a.prioridade === 'CRITICA' || a.prioridade === 'ALTA';
      const agora = c.relogio.passoEmCurso()!;
      const DESTINOS: Partial<Record<typeof a.desfecho, Destino>> = {
        programada: 'pendente',
        em_execucao: 'em_execucao',
        pausada: 'pausada',
        executada: 'executada',
        auditada: 'auditada',
      };
      const destino: Destino = DESTINOS[a.desfecho] ?? 'normal';
      // Parada longa: a equipe chega no começo do último dia; curta: assim que aprovada
      const fimDaParada = a.parouHoras ? somarHoras(quando, a.parouHoras) : null;
      const inicioDesejado =
        destino === 'em_execucao'
          ? somarHoras(c.agora, -3)
          : destino === 'pausada'
            ? somarHoras(c.agora, -5)
            : fimDaParada
              ? new Date(Math.max(somarHoras(agora, 1.5).getTime(), somarHoras(fimDaParada, -Math.min(6, a.parouHoras! * 0.6)).getTime()))
              : urgente
                ? somarHoras(agora, 2)
                : undefined;
      contarHistoria(
        c,
        linha,
        {
          programacaoId,
          planta: e.planta,
          tipo: 'corretiva',
          destino,
          dia: inicioDesejado ?? somarDias(agora, 1),
          inicioDesejado,
          falha: { inicio: quando, horas: a.parouHoras, dados: a.falha, resultado: a.resultado, equipamento: e, troca: a.desfecho === 'troca', urgente: Boolean(inicioDesejado) },
        },
        somarHoras(agora, 0.3),
      );
    });
  });
}

function solicitacao(c: Cenario, linha: LinhaDoTempo, sol: SolicitacaoDoSeed, i: number): void {
  const quando = as(somarDias(c.agora, -sol.diasAtras), `${String(9 + (i % 6)).padStart(2, '0')}:${i % 2 ? '15' : '40'}`);
  linha.marcar(quando, `solicitação ${sol.titulo}`, async () => {
    const planta = c.plantas.get(sol.planta)!;
    const unidade = planta.unidades.get(sol.unidade)!;
    const cliente = pessoa(c, planta.dados.dono);
    const e = sol.equipamento ? equipamento(c, sol.planta, sol.unidade, sol.equipamento) : undefined;
    const criada = await c.s.solicitacoes.create(
      await validar(
        CreateSolicitacaoDto,
        {
          titulo: sol.titulo,
          descricao: sol.descricao,
          tipo: sol.tipo,
          prioridade: sol.prioridade,
          origem: 'PORTAL',
          planta_id: planta.id,
          unidade_id: unidade.id,
          ...(e && { equipamento_id: e.id }),
          local: `${planta.nome} — ${unidade.nome}`,
          data_necessidade: instante(as(somarDias(quando, sol.prazoDias), '18:00')),
          justificativa: sol.justificativa,
          contato: cliente.nome,
          instrucoes_ids: sol.instrucoes.map((cod) => idDe(c.instrucoes, cod, 'Instrução')),
        },
        `solicitação ${sol.titulo}`,
      ),
      cliente.id,
      cliente.usuario,
    );
    const id = criada.id.trim();
    const equipe = pessoa(c, 'felipe');
    if (sol.comentarioDoCliente) {
      linha.marcar(somarHoras(quando, 0.5), `comentário do cliente ${id}`, async () => {
        await c.s.comentarios.comentar('solicitacao_servico', id, { comentario: sol.comentarioDoCliente! }, cliente.usuario);
      });
    }

    // A equipe fecha a proposta (29/out/2026): as instruções com o valor do catálogo, o km, o
    // deslocamento, as diárias de quem dorme fora e a validade; imposto e margem são os padrões
    linha.marcar(as(somarDias(quando, 1), '10:30'), `proposta ${id}`, async () => {
      const distancia = planta.dados.distanciaKm;
      const longe = distancia > 300;
      await c.s.propostas.recarregar(id);
      await c.s.propostas.salvarLogistica(id, 'DESLOCAMENTO', [
        { descricao: 'Picape da equipe', dias: longe ? 2 : 1, valor_unitario: 180, km: distancia * 2, valor_km: 1.35 },
      ]);
      if (longe) {
        await c.s.propostas.salvarLogistica(id, 'DIARIA', [
          { descricao: 'Almoço', quantidade: 4, valor_unitario: 45 },
          { descricao: 'Pernoite', quantidade: 2, valor_unitario: 220 },
        ]);
      }
      await c.s.propostas.salvarCondicoes(id, {
        distancia_km: distancia,
        distancia_ida_volta_km: distancia * 2,
        dias_previstos: longe ? 2 : 1,
        pessoas_previstas: 2,
        noites_fora: longe ? 1 : 0,
        validade_proposta: new Date(`${diaDe(somarDias(quando, 31))}T00:00:00.000Z`),
        condicoes_comerciais: 'Pagamento em 30 dias da entrega do relatório.',
      });
      if (sol.respostaDaEquipe) await c.s.comentarios.comentar('solicitacao_servico', id, { comentario: sol.respostaDaEquipe }, equipe.usuario);
      if (sol.notaInterna) await c.s.comentarios.comentar('solicitacao_servico', id, { comentario: sol.notaInterna, interno: true }, equipe.usuario);
    });
    if (sol.desfecho === 'aberta') return;

    // A equipe revisa a proposta (29/out/2026): só a revisada se programa
    linha.marcar(as(somarDias(quando, 2), '16:00'), `revisar proposta ${id}`, async () => {
      await c.s.propostas.revisar(id, equipe.id);
    });
    if (sol.desfecho === 'revisada') return;
    if (sol.desfecho === 'nao_aprovada') {
      linha.marcar(as(somarDias(quando, 3), '11:00'), `proposta não aprovada ${id}`, async () => {
        await c.s.propostas.naoAprovada(id, sol.motivoDaRecusa ?? 'O cliente não aprovou a proposta.', equipe.id);
      });
      return;
    }

    // O cliente aceita, vira programação; a OS vai no meio do prazo pedido
    linha.marcar(as(somarDias(quando, 3), '09:00'), `programar serviço ${id}`, async () => {
      const programacao = await c.s.programacoes.criarDeSolicitacao(id, {}, equipe.id, equipe.usuario);
      const agora = c.relogio.passoEmCurso()!;
      contarHistoria(
        c,
        linha,
        {
          programacaoId: programacao.id.trim(),
          planta,
          tipo: 'servico',
          destino: 'normal',
          dia: somarDias(quando, Math.max(5, Math.round(sol.prazoDias / 2))),
          resultado: `${sol.titulo}: serviço executado e relatório entregue ao cliente.`,
        },
        somarHoras(agora, 2),
      );
    });
  });
}

function reservasAvulsas(c: Cenario, linha: LinhaDoTempo): void {
  for (const r of RESERVAS_AVULSAS) {
    // As próximas reservas foram pedidas nos últimos dias
    const pedida = as(somarDias(c.agora, -2), '15:00');
    linha.marcar(pedida, `reserva avulsa ${r.finalidade}`, async () => {
      const responsavel = pessoa(c, r.responsavel);
      const veiculo = c.veiculos.get(r.veiculo)!;
      const inicio = somarDias(c.agora, -r.diasAtras);
      const criada = await c.s.reservas.criar(
        await validar(
          CreateReservaDto,
          {
            veiculoId: veiculo.id,
            tipoSolicitante: r.tipo,
            dataInicio: diaDe(inicio),
            dataFim: diaDe(somarDias(inicio, r.dias - 1)),
            horaInicio: r.horaInicio,
            horaFim: r.horaFim,
            responsavel: responsavel.nome,
            responsavelId: responsavel.id,
            finalidade: r.finalidade,
            criadoPor: responsavel.nome,
            criadoPorId: responsavel.id,
          },
          `reserva ${r.finalidade}`,
        ),
        responsavel.usuario,
      );
      if (r.diasAtras > 0) {
        linha.marcar(as(somarDias(inicio, r.dias - 1), r.horaFim), `devolver viatura ${r.finalidade}`, async () => {
          await c.s.reservas.finalizar(criada.id.trim(), responsavel.usuario);
        });
      }
    });
  }
}

export function marcarOcorrencias(c: Cenario, linha: LinhaDoTempo): void {
  for (const a of ANOMALIAS) anomalia(c, linha, a);
  SOLICITACOES.forEach((s, i) => solicitacao(c, linha, s, i));
  reservasAvulsas(c, linha);
}
