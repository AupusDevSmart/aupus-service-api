/**
 * Aponta os testes para um banco SEPARADO, nunca para o de desenvolvimento.
 *
 * Os specs deste repo eram todos baseados em mock — e foi por isso que
 * apodreceram: 16 dos 75 falhavam sem que nada tivesse quebrado de fato. Mock
 * tambem nao serve para o que estamos construindo aqui: "um equipamento ativo
 * por posicao" e garantido por indice unico parcial, e nenhum mock prova indice.
 *
 * O banco `aupus_test` e criado vazio ao lado do de dev, no mesmo container, e
 * pode ser destruido e refeito a qualquer momento. Rodar teste contra
 * `aupus_local` contaminaria dado de trabalho — e aquele banco e compartilhado
 * com outro sistema.
 */
const url = process.env.DATABASE_URL_TEST
  ?? 'postgresql://postgres:postgres@localhost:5433/aupus_test?schema=public';

process.env.DATABASE_URL = url;

if (!/aupus_test/.test(url)) {
  throw new Error(
    `Os testes so rodam contra o banco de teste. DATABASE_URL aponta para: ${url}`,
  );
}

/**
 * Os specs de banco rodam em SERIE (`maxWorkers: 1` no package.json).
 *
 * Eles compartilham um banco so, e cada um limpa as tabelas que usa no
 * `beforeEach`. Em paralelo, um apaga a fixture do outro no meio da execucao: a
 * mesma suite passa sozinha e falha junto, o que e a forma mais cara de bug de
 * teste — parece defeito no codigo e nao e.
 *
 * Medido: 21 de 21 em serie, 19 de 21 em paralelo.
 *
 * Dar um schema por suite resolveria sem perder paralelismo, e e o caminho se a
 * suite crescer a ponto de a lentidao incomodar.
 */