/**
 * O maior KM de viatura que a API aceita (o KM inicial e o final da reserva e a
 * quilometragem do veículo). As colunas são Int: acima de 2.147.483.647 o Postgres
 * recusava e a resposta era 500. Dez milhões de km já é dado errado.
 */
export const KM_MAXIMO = 9_999_999;
