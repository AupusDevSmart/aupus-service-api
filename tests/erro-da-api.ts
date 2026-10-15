import axios, { AxiosError } from 'axios';

/** O corpo de erro do aupus-service-api (o `message` do Nest pode vir em lista). */
export interface RespostaDeErro {
  message?: string | string[];
  [campo: string]: unknown;
}

/**
 * O erro pego num `catch` dos testes, sempre na forma do axios: o que veio da
 * API traz `response`; qualquer outro (rede, código do teste) vira um AxiosError
 * sem resposta, com a mesma mensagem — os relatórios leem os dois do mesmo jeito.
 */
export function erroDaApi(erro: unknown): AxiosError<RespostaDeErro> {
  if (axios.isAxiosError<RespostaDeErro>(erro)) return erro;
  return new AxiosError<RespostaDeErro>(erro instanceof Error ? erro.message : String(erro));
}
