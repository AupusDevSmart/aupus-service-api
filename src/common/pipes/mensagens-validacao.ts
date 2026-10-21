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
  garantia_ate: 'garantia',
  centro_custo: 'centro de custo',
  equipamento_pai_id: 'equipamento pai',
  unidade_id: 'instalação',
  planta_id: 'planta',
  proprietario_id: 'proprietário',
  instrucao_id: 'instrução',
  recurso_id: 'recurso',
  solicitacao_id: 'solicitação',
  preco_unitario: 'preço unitário',
  faturamento_direto: 'faturamento direto',
  bdi_regime: 'regime tributário',
  bdi_administracao_central: 'administração central',
  bdi_seguro_garantia: 'seguro e garantia',
  bdi_taxa_risco: 'taxa de risco',
  bdi_despesas_financeiras: 'despesas financeiras',
  bdi_lucro: 'lucro',
  bdi_pis: 'PIS',
  bdi_cofins: 'COFINS',
  bdi_cprb: 'CPRB',
  bdi_issqn: 'ISSQN',
  cpf_cnpj: 'CPF/CNPJ',
  criado_por: 'autor',
  valor_minimo: 'mínimo da faixa',
  valor_maximo: 'máximo da faixa',
  valor_lido: 'valor lido',
  // SN-85: a instrução e as linhas dela, com os campos do AupusProject
  codigo: 'código',
  prazo_inicio_relativo: 'início (D+X)',
  duracao_dias: 'duração em dias',
  duracao_horas: 'duração em horas',
  fator_perda: 'perda',
  fornecido_pelo_cliente: 'fornecido pelo cliente',
  distancia_km: 'distância em km',
  preco_proprio: 'preço próprio',
  maquinario_id: 'maquinário',
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
  // A frase escrita no DTO sem o limite dentro: a tradução diria "no máximo undefined" (SN-85)
  if ((restricao === 'min' || restricao === 'max') && numero === undefined) return original;

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
    case 'casasDecimais':
      // A frase padrão do CasasDecimais ganha o nome do campo; a escrita no DTO fica
      return original.startsWith('Use no máximo')
        ? `${nome} aceita no máximo ${numero} ${numero === '1' ? 'casa decimal' : 'casas decimais'}.`
        : original;
    case 'minLength':
      return `${nome} deve ter ao menos ${numero} caracteres.`;
    case 'maxLength':
      return `${nome} deve ter no máximo ${numero} caracteres.`;
    case 'isLength':
      // @Length(min, max): o class-validator diz qual dos dois limites falhou.
      return original.includes('shorter')
        ? `${nome} deve ter no máximo ${numero} caracteres.`
        : `${nome} deve ter ao menos ${numero} caracteres.`;
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

export type ErroDeCampo = {
  /** O caminho no payload: `nome`, `sub_instrucoes.2.descricao`. */
  campo: string;
  mensagem: string;
};

/**
 * Achata os erros aninhados (listas dentro do payload), guardando o caminho de
 * cada um — a importação de planilha usa o índice do item para apontar a linha.
 */
export function errosPorCampo(erros: ValidationError[], prefixo = ''): ErroDeCampo[] {
  const lista: ErroDeCampo[] = [];

  for (const erro of erros) {
    const campo = prefixo ? `${prefixo}.${erro.property}` : erro.property;

    if (erro.constraints) {
      for (const [restricao, texto] of Object.entries(erro.constraints)) {
        lista.push({ campo, mensagem: traduzir(erro.property, restricao, texto) });
      }
    }

    // Laço, não spread: com dezenas de milhares de erros o spread estourava a
    // pilha e o 400 virava 500 (revisão do SN-50)
    if (erro.children?.length) {
      for (const filho of errosPorCampo(erro.children, campo)) lista.push(filho);
    }
  }

  return lista;
}

/**
 * Entregue ao ValidationPipe global. Mantém o formato de array que o front já
 * sabe ler (`formatApiError` junta com "; ").
 */
/** Mais que isto não ajuda ninguém a corrigir, e 975 mil frases davam 35 MB de resposta (revisão do SN-50). */
const FRASES_NO_ERRO = 200;

export function exceptionFactoryEmPortugues(erros: ValidationError[]) {
  const frases = errosPorCampo(erros).map((e) => e.mensagem);
  if (frases.length === 0) return new BadRequestException(['Dados inválidos.']);
  const mostradas = frases.slice(0, FRASES_NO_ERRO);
  if (frases.length > FRASES_NO_ERRO) mostradas.push(`e mais ${frases.length - FRASES_NO_ERRO} erros`);
  return new BadRequestException(mostradas);
}
