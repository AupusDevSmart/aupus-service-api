import { Injectable } from '@nestjs/common';
import { concessionarias_energia, ConcessionariasService, PrismaService } from '@/core';
import { CreateConcessionariaDto } from '@/core/modules/concessionarias/dto/create-concessionaria.dto';
import { UpdateConcessionariaDto } from '@/core/modules/concessionarias/dto/update-concessionaria.dto';
import { CadastroImportavel } from '../importacao.types';

const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** As 14 colunas de tarifa, na ordem em que a planilha as mostra. */
const TARIFAS = [
  'a4_verde_tusd_d', 'a4_verde_tusd_p', 'a4_verde_tusd_fp', 'a4_verde_te_d', 'a4_verde_te_p', 'a4_verde_te_fp',
  'a3a_verde_tusd_d', 'a3a_verde_tusd_p', 'a3a_verde_tusd_fp', 'a3a_verde_te_d', 'a3a_verde_te_p', 'a3a_verde_te_fp',
  'b_tusd_valor', 'b_te_valor',
] as const;

/**
 * Concessionárias: cadastro plano — as tarifas são campos fixos por subgrupo,
 * não lista. Os horários de ponta e reservado não entram (a tela não os grava,
 * SN-11); anexos não viajam.
 */
@Injectable()
export class ConcessionariasImportacao implements CadastroImportavel<concessionarias_energia> {
  readonly singular = 'concessionária';
  readonly dtoDeCriacao = CreateConcessionariaDto;
  readonly dtoDeEdicao = UpdateConcessionariaDto;

  constructor(
    private readonly concessionarias: ConcessionariasService,
    private readonly prisma: PrismaService,
  ) {}

  async buscar(id: string) {
    await this.concessionarias.findOne(id);
    return this.prisma.concessionarias_energia.findUniqueOrThrow({ where: { id } });
  }

  async criar(dto: object) {
    return this.concessionarias.create(dto as CreateConcessionariaDto);
  }

  atualizar(atual: concessionarias_energia, dto: object) {
    return this.concessionarias.update(atual.id, dto as UpdateConcessionariaDto);
  }

  async retrato(id: string) {
    const c = await this.prisma.concessionarias_energia.findUniqueOrThrow({ where: { id } });
    return {
      nome: c.nome,
      estado: c.estado,
      numero_reh: c.numero_reh,
      data_inicio: c.data_inicio.toISOString().slice(0, 10),
      data_validade: c.data_validade.toISOString().slice(0, 10),
      tarifas: TARIFAS.map((t) => numero(c[t])),
    };
  }

  idDe(atual: concessionarias_energia) {
    return atual.id.trim();
  }

  nomeDe(atual: concessionarias_energia | null, dto: object) {
    return (dto as UpdateConcessionariaDto).nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: concessionarias_energia) {
    return atual.updated_at;
  }
}
