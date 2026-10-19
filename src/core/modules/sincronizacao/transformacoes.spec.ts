import { antesDeGravar } from './transformacoes';

describe('antesDeGravar', () => {
  // SN-64: a conversão do banco foi só no Service; o NexOn ficou com o A/B/C
  // dele, e uma edição lá não pode trazer o valor antigo de volta
  it('equipamento: a criticidade antiga A/B/C chega na escala de 1 a 5', () => {
    for (const [antiga, nova] of [['A', '5'], ['b', '3'], [' C ', '1']]) {
      const dados: Record<string, unknown> = { nome: 'Inversor', criticidade: antiga };
      antesDeGravar('equipamentos', dados);
      expect(dados).toEqual({ nome: 'Inversor', criticidade: nova });
    }
  });

  it('equipamento: criticidade de 1 a 5, ausente ou desconhecida chega como veio', () => {
    for (const dados of [{ criticidade: '4' }, { nome: 'sem criticidade' }, { criticidade: 'X' }]) {
      const copia: Record<string, unknown> = { ...dados };
      antesDeGravar('equipamentos', copia);
      expect(copia).toEqual(dados);
    }
  });
});
