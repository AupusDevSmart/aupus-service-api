import { TipoSolicitacaoServico } from '@prisma/client';
import { tipoDaOSDaSolicitacao } from './tipo-da-os-da-solicitacao';

/**
 * A solicitação de instalação virava OS corretiva, e a corretiva exige
 * sintoma, causa e ação de falha: o técnico inventava a falha para executar o
 * serviço, e ele entrava no indicador de corretivas (achado do SN-87).
 */
describe('tipo da OS que nasce da solicitação', () => {
  it('só a manutenção corretiva vira CORRETIVA', () => {
    const corretivas = Object.values(TipoSolicitacaoServico).filter((t) => tipoDaOSDaSolicitacao(t) === 'CORRETIVA');
    expect(corretivas).toEqual(['MANUTENCAO_CORRETIVA']);
  });

  it.each([
    ['INSTALACAO', 'VISITA_TECNICA'],
    ['MODIFICACAO', 'VISITA_TECNICA'],
    ['REMOCAO', 'VISITA_TECNICA'],
    ['OUTRO', 'VISITA_TECNICA'],
    ['CONSULTORIA', 'VISITA_TECNICA'],
    ['TREINAMENTO', 'VISITA_TECNICA'],
    ['INSPECAO', 'INSPECAO'],
    ['CALIBRACAO', 'INSPECAO'],
    ['MANUTENCAO_PREVENTIVA', 'PREVENTIVA'],
  ])('%s vira %s', (solicitacao, os) => {
    expect(tipoDaOSDaSolicitacao(solicitacao)).toBe(os);
  });

  it('tipo desconhecido não vira corretiva calado', () => {
    expect(tipoDaOSDaSolicitacao('ALGO_NOVO')).toBe('VISITA_TECNICA');
  });
});
