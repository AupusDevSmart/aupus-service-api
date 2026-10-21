/**
 * O maior valor que cada DECIMAL do banco guarda. Acima, o Postgres recusa e a
 * rota dava 500: o DTO barra antes com 400 (`@Max(DECIMAL_12_2)`, a frase sai
 * do mensagens-validacao com o nome do campo e o limite).
 */
export const DECIMAL_12_2 = 9_999_999_999.99;
export const DECIMAL_10_2 = 99_999_999.99;
export const DECIMAL_10_3 = 9_999_999.999;
