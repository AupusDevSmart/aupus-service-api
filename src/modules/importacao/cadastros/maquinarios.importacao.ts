import { Injectable } from '@nestjs/common';
import { PrismaService, maquinarios } from '@/core';
import { MaquinariosService } from '@/modules/maquinarios/maquinarios.service';
import { CreateMaquinarioDto, UpdateMaquinarioDto } from '@/modules/maquinarios/dto/maquinario.dto';
import { CadastroImportavel } from '../importacao.types';
import { semOQueNaoMudou } from '../sem-o-que-nao-mudou';

/** Maquinários (SN-84): cadastro plano, sem referência a outro cadastro e sem escopo de planta. */
@Injectable()
export class MaquinariosImportacao implements CadastroImportavel<maquinarios> {
  readonly singular = 'maquinário';
  readonly dtoDeCriacao = CreateMaquinarioDto;
  readonly dtoDeEdicao = UpdateMaquinarioDto;

  constructor(
    private readonly maquinarios: MaquinariosService,
    private readonly prisma: PrismaService,
  ) {}

  buscar(id: string) {
    return this.maquinarios.buscarPorId(id);
  }

  /** Nome e descrição antigos, fora da regra de hoje, não travam a linha se não mudaram. */
  async prepararDados(dados: Record<string, unknown>, _usuario: unknown, atual: maquinarios | null) {
    return semOQueNaoMudou(dados, atual, { nome: 'nome', descricao: 'descricao' });
  }

  async criar(dto: object) {
    return this.maquinarios.criar(dto as CreateMaquinarioDto);
  }

  atualizar(atual: maquinarios, dto: object) {
    return this.maquinarios.atualizar(atual.id, dto as UpdateMaquinarioDto);
  }

  async retrato(id: string) {
    const m = await this.prisma.maquinarios.findUniqueOrThrow({ where: { id } });
    const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      nome: m.nome,
      tipo: m.tipo,
      descricao: m.descricao,
      base_calculo: m.base_calculo,
      rubrica: m.rubrica,
      preco_unitario: numero(m.preco_unitario),
      valor_aquisicao: numero(m.valor_aquisicao),
      prazo_retorno_meses: m.prazo_retorno_meses,
      custos_anuais: numero(m.custos_anuais),
      meta_utilizacao_horas: numero(m.meta_utilizacao_horas),
      horas_por_diaria: m.horas_por_diaria,
      ativo: m.ativo,
    };
  }

  idDe(atual: maquinarios) {
    return atual.id.trim();
  }

  nomeDe(atual: maquinarios | null, dto: object) {
    return (dto as UpdateMaquinarioDto).nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: maquinarios) {
    return atual.updated_at;
  }
}
