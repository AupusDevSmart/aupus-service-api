import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Todo `include` de `tipo_equipamento_rel` precisa trazer `categoria_id`.
 *
 * O front monta `tipoEquipamentoObj.categoriaId` a partir desse campo, e e ele
 * que reabre o sheet do equipamento com a Categoria ja selecionada — que por
 * sua vez destrava o campo Modelo.
 *
 * Este teste existe porque a falha e MUDA: um `select` sem `categoria_id`
 * devolve o tipo normalmente, com id, codigo, nome e ate o objeto `categoria`
 * aninhado. Nada quebra, nada loga. So o campo Categoria aparece vazio e o
 * Modelo travado em "Selecione uma categoria primeiro" — e a unica forma de
 * descobrir e abrindo o sheet.
 *
 * Aconteceu de verdade: dois dos quatro selects do service tinham o campo e
 * dois nao, e o `findOne` (o que o sheet usa) era um dos incompletos.
 *
 * Le o fonte em vez de chamar o Prisma porque o que se quer garantir e a FORMA
 * DA CONSULTA. Um teste de integracao passaria com qualquer select que devolva
 * o tipo, que e exatamente o buraco por onde o bug entrou.
 */
describe('select de tipo_equipamento_rel', () => {
  const fonte = fs.readFileSync(
    path.join(__dirname, 'equipamentos.service.ts'),
    'utf8',
  );

  /** Extrai o corpo de cada bloco `tipo_equipamento_rel: { select: { ... } }`. */
  function blocosDeSelect(): string[] {
    const blocos: string[] = [];
    const marcador = 'tipo_equipamento_rel: {';
    let i = fonte.indexOf(marcador);

    while (i !== -1) {
      // Varre contando chaves ate fechar o bloco — regex nao aninha.
      let profundidade = 0;
      let j = i + marcador.length - 1;
      do {
        if (fonte[j] === '{') profundidade++;
        else if (fonte[j] === '}') profundidade--;
        j++;
      } while (profundidade > 0 && j < fonte.length);

      blocos.push(fonte.slice(i, j));
      i = fonte.indexOf(marcador, j);
    }
    return blocos;
  }

  it('existe pelo menos um bloco para conferir', () => {
    expect(blocosDeSelect().length).toBeGreaterThan(0);
  });

  it('TODO select de tipo_equipamento_rel traz categoria_id', () => {
    const semCategoriaId = blocosDeSelect().filter(
      b => b.includes('select:') && !b.includes('categoria_id: true'),
    );

    expect(
      semCategoriaId.length === 0
        ? []
        : semCategoriaId.map(b => b.slice(0, 120).replace(/\s+/g, ' ')),
    ).toEqual([]);
  });

  it('TODO select de tipo_equipamento_rel traz fabricante', () => {
    // O sheet mostra "Fabricante (do modelo)" a partir daqui; sem o campo o
    // valor some do formulario do mesmo jeito silencioso.
    const semFabricante = blocosDeSelect().filter(
      b => b.includes('select:') && !b.includes('fabricante: true'),
    );

    expect(
      semFabricante.length === 0
        ? []
        : semFabricante.map(b => b.slice(0, 120).replace(/\s+/g, ' ')),
    ).toEqual([]);
  });
});
