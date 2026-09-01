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
