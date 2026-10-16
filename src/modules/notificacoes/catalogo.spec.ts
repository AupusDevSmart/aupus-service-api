import { plainToInstance } from 'class-transformer';
import { PERMISSOES } from '@/core/modules/permissions/matriz-de-permissoes';
import { EVENTOS } from './catalogo';
import { ListarNotificacoesDto } from './notificacoes.dto';

/**
 * Permissão renomeada na matriz não pode fazer um evento parar de avisar sem
 * ninguém notar: o processador acharia zero destinatários, e zero é um
 * resultado normal (o único envolvido foi quem agiu).
 */
describe('catálogo de notificações', () => {
  const catalogo = new Set(PERMISSOES.map((p) => p.name));

  it.each(Object.entries(EVENTOS).filter(([, d]) => 'permissao' in d))('%s: a permissão do próximo passo existe na matriz', (_, definicao) => {
    expect(catalogo).toContain((definicao as { permissao: string }).permissao);
  });

  it('todo evento avisa alguém: tem permissão ou envolvidos', () => {
    const mudos = Object.entries(EVENTOS).filter(([, d]) => !('permissao' in d) && d.envolvidos.length === 0);
    expect(mudos).toEqual([]);
  });
});

/** Como o ValidationPipe global converte (enableImplicitConversion): "false" virava true. */
describe('filtro da lista', () => {
  const ler = (query: Record<string, unknown>) => plainToInstance(ListarNotificacoesDto, query, { enableImplicitConversion: true });

  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ])('somenteNaoLidas=%p vira %p', (valor, esperado) => {
    expect(ler({ somenteNaoLidas: valor }).somenteNaoLidas).toBe(esperado);
  });
});
