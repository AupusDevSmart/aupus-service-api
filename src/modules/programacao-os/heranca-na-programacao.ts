import { BadRequestException } from '@nestjs/common';
import { herancaDaProposta } from '../solicitacoes-servico/heranca-da-proposta';

/** O teto das colunas de valor da programação, Decimal(12, 2): a proposta guarda até Decimal(14, 2) */
const TETO_NA_PROGRAMACAO = 9_999_999_999.99;
import type { CreateProgramacaoDto } from './dto/create-programacao.dto';

/**
 * A programação nova de uma solicitação recebe o que a proposta revisada diz
 * (29/out/2026), num lugar só — a tela e a rota `from-solicitacao` passam por
 * aqui: o valor de cada instrução na proposta, o frete, o deslocamento, as
 * diárias e os custos adicionais como outros custos previstos, e o veículo.
 *
 * O que quem programa já mandou vale: o valor ajustado de uma instrução fica
 * (a proposta só preenche as que vieram sem ajuste), e o veículo pedido não se
 * desliga. Os outros custos da proposta se somam aos que as instruções trazem.
 */
export async function comAHerancaDaProposta(
  db: Parameters<typeof herancaDaProposta>[0],
  dto: CreateProgramacaoDto,
): Promise<CreateProgramacaoDto> {
  const solicitacaoId =
    dto.solicitacao_servico_id?.trim() || (dto.dados_origem as { solicitacaoServicoId?: string } | undefined)?.solicitacaoServicoId?.trim();
  if (!solicitacaoId) return dto;

  const heranca = await herancaDaProposta(db, solicitacaoId);
  const valores = [...heranca.valores_das_instrucoes, ...heranca.itens_orcamento].map((v) => v.valor);
  if (valores.some((v) => v > TETO_NA_PROGRAMACAO) || valores.reduce((s, v) => s + v, 0) > TETO_NA_PROGRAMACAO) {
    throw new BadRequestException('A proposta passa do que a programação guarda (até R$ 9.999.999.999,99): confira os valores dela.');
  }
  const ajustadas = new Set((dto.valores_das_instrucoes ?? []).map((v) => v.instrucao_id?.trim()).filter(Boolean));
  // A instrução que quem programa tirou da lista não leva o valor (não há linha para ele)
  const naLista = dto.instrucoes_ids ? new Set(dto.instrucoes_ids.map((id) => id?.trim())) : null;
  return {
    ...dto,
    necessita_veiculo: dto.necessita_veiculo || heranca.necessita_veiculo,
    valores_das_instrucoes: [
      ...(dto.valores_das_instrucoes ?? []),
      ...heranca.valores_das_instrucoes.filter((v) => !ajustadas.has(v.instrucao_id) && (!naLista || naLista.has(v.instrucao_id))),
    ],
    itens_orcamento: [...(dto.itens_orcamento ?? []), ...heranca.itens_orcamento],
    // A tela manda o orçamento dela (sem o que vem da proposta), e ele vence o calculado
    // aqui: sem a soma, a OS mostrava um "ajuste da aprovação" negativo que ninguém fez
    ...(dto.orcamento_previsto ? { orcamento_previsto: Math.round((dto.orcamento_previsto + heranca.itens_orcamento.reduce((s, i) => s + i.valor, 0)) * 100) / 100 } : {}),
  };
}
