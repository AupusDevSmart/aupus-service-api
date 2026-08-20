// src/common/pipes/mensagens-validacao.ts
import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Traduz as mensagens do class-validator para português.
 *
 * Feito num lugar só, e não decorator por decorator: são centenas de campos
 * espalhados por dezenas de DTOs, e a alternativa seria escrever `message:` em
 * cada um — trabalhoso de aplicar e fácil de esquecer no próximo campo criado.
 * Aqui qualquer regra nova já nasce traduzida.
 *
 * O que o usuário via antes: "tempo_estimado must not be less than 1".
 */

/** Nomes de campo que ficam ruins quando só se troca `_` por espaço. */
const NOMES: Record<string, string> = {
  tempo_estimado: 'tempo estimado',
  duracao_estimada: 'duração estimada',
  tipo_manutencao: 'tipo de manutenção',
  condicao_ativo: 'condição do ativo',
  numero_serie: 'número de série',
  localizacao_especifica: 'localização específica',
  data_instalacao: 'data de instalação',
  equipamento_pai_id: 'equipamento pai',
  unidade_id: 'instalação',
  planta_id: 'planta',
  proprietario_id: 'proprietário',
  instrucao_id: 'instrução',
  recurso_id: 'recurso',
  solicitacao_id: 'solicitação',
  preco_unitario: 'preço unitário',
  faturamento_direto: 'faturamento direto',
  lucro_percentual: 'lucro',
  aliquota_percentual: 'alíquota',
  com_nota_fiscal: 'nota fiscal',
  cpf_cnpj: 'CPF/CNPJ',
  criado_por: 'autor',
};

const nomeAmigavel = (campo: string) => NOMES[campo] ?? campo.replace(/_/g, ' ');

/**
 * Cada regra do class-validator vira uma frase.
 *
 * A chave é o nome da restrição (`min`, `isNotEmpty`...); o texto original em
 * inglês vem junto porque algumas regras carregam o limite dentro dele e é de
 * lá que o número é extraído.
 */
function traduzir(campo: string, restricao: string, original: string): string {
  const nome = nomeAmigavel(campo);
  const numero = original.match(/-?\d+(\.\d+)?/)?.[0];

  switch (restricao) {
    case 'isNotEmpty':
      return `Informe ${nome}.`;
    case 'isDefined':
      return `${nome} é obrigatório.`;
    case 'min':
      return numero === '0'
        ? `${nome} não pode ser negativo.`
        : `${nome} deve ser no mínimo ${numero}.`;
    case 'max':
      return `${nome} deve ser no máximo ${numero}.`;
    case 'minLength':
      return `${nome} deve ter ao menos ${numero} caracteres.`;
    case 'maxLength':
      return `${nome} deve ter no máximo ${numero} caracteres.`;
    case 'isInt':
      return `${nome} deve ser um número inteiro.`;
    case 'isNumber':
    case 'isNumberString':
      return `${nome} deve ser um número.`;
    case 'isString':
      return `${nome} deve ser um texto.`;
    case 'isBoolean':
      return `${nome} deve ser sim ou não.`;
    case 'isDateString':
    case 'isDate':
      return `${nome} deve ser uma data válida.`;
    case 'isEmail':
      return `${nome} deve ser um e-mail válido.`;
    case 'isUUID':
    case 'isMongoId':
      return `${nome} tem formato inválido.`;
    case 'isEnum':
      return `${nome} tem um valor não permitido.`;
    case 'isArray':
      return `${nome} deve ser uma lista.`;
    case 'arrayNotEmpty':
      return `${nome} não pode ficar vazio.`;
    case 'whitelistValidation':
      // Este chega ao usuário quando o front manda campo a mais. Não é erro
      // dele, e a frase precisa dizer isso sem jargão.
      return `O campo "${nome}" não é aceito aqui.`;
    default:
      // Regra sem tradução: melhor a frase original do que engolir o motivo.
      return original;
  }
}

/** Achata os erros aninhados (listas dentro do payload) numa lista de frases. */
function coletar(erros: ValidationError[], prefixo = ''): string[] {
  const frases: string[] = [];

  for (const erro of erros) {
    const campo = prefixo ? `${prefixo}.${erro.property}` : erro.property;

    if (erro.constraints) {
      for (const [restricao, texto] of Object.entries(erro.constraints)) {
        frases.push(traduzir(erro.property, restricao, texto));
      }
    }

    if (erro.children?.length) {
      frases.push(...coletar(erro.children, campo));
    }
  }

  return frases;
}

/**
 * Entregue ao ValidationPipe global. Mantém o formato de array que o front já
 * sabe ler (`formatApiError` junta com "; ").
 */
export function exceptionFactoryEmPortugues(erros: ValidationError[]) {
  const frases = coletar(erros);
  return new BadRequestException(frases.length > 0 ? frases : ['Dados inválidos.']);
}
