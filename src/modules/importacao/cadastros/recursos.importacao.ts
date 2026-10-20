import { Injectable } from '@nestjs/common';
import { PrismaService, recursos } from '@/core';
import { RecursosService } from '@/modules/recursos/recursos.service';
import { CreateRecursoDto, UpdateRecursoDto } from '@/modules/recursos/dto/recurso.dto';
import { CadastroImportavel } from '../importacao.types';
import { semOQueNaoMudou } from '../sem-o-que-nao-mudou';

/** Recursos: cadastro plano, sem referência a outro cadastro e sem escopo de planta. */
@Injectable()
export class RecursosImportacao implements CadastroImportavel<recursos> {
  readonly singular = 'recurso';
  readonly dtoDeCriacao = CreateRecursoDto;
  readonly dtoDeEdicao = UpdateRecursoDto;

  constructor(
    private readonly recursos: RecursosService,
    private readonly prisma: PrismaService,
  ) {}

  buscar(id: string) {
    return this.recursos.buscarPorId(id);
  }

  /** Nome, unidade e função antigos, fora da regra de hoje, não travam a linha se não mudaram. */
  async prepararDados(dados: Record<string, unknown>, _usuario: unknown, atual: recursos | null) {
    return semOQueNaoMudou(dados, atual, { nome: 'nome', unidade: 'unidade', funcao: 'funcao', descricao: 'descricao' });
  }

  async criar(dto: object) {
    return this.recursos.criar(dto as CreateRecursoDto);
  }

  atualizar(atual: recursos, dto: object) {
    return this.recursos.atualizar(atual.id, dto as UpdateRecursoDto);
  }

  async retrato(id: string) {
    const r = await this.prisma.recursos.findUniqueOrThrow({ where: { id } });
    const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      categoria: r.categoria,
      nome: r.nome,
      funcao: r.funcao,
      descricao: r.descricao,
      unidade: r.unidade,
      base_calculo: r.base_calculo,
      rubrica: r.rubrica,
      preco_unitario: numero(r.preco_unitario),
      valor_aquisicao: numero(r.valor_aquisicao),
      prazo_retorno_meses: r.prazo_retorno_meses,
      custos_anuais: numero(r.custos_anuais),
      meta_utilizacao_horas: numero(r.meta_utilizacao_horas),
      horas_por_diaria: r.horas_por_diaria,
      ativo: r.ativo,
    };
  }

  idDe(atual: recursos) {
    return atual.id.trim();
  }

  nomeDe(atual: recursos | null, dto: object) {
    return (dto as UpdateRecursoDto).nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: recursos) {
    return atual.updated_at;
  }
}
