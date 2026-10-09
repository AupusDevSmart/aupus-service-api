import { Injectable } from '@nestjs/common';
import { PrismaService, recursos } from '@/core';
import { RecursosService } from '@/modules/recursos/recursos.service';
import { CreateRecursoDto, UpdateRecursoDto } from '@/modules/recursos/dto/recurso.dto';
import { CadastroImportavel } from '../importacao.types';

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

  async criar(dto: object) {
    return this.recursos.criar(dto as CreateRecursoDto);
  }

  atualizar(atual: recursos, dto: object) {
    return this.recursos.atualizar(atual.id, dto as UpdateRecursoDto);
  }

  async retrato(id: string) {
    const r = await this.prisma.recursos.findUniqueOrThrow({ where: { id } });
    return {
      categoria: r.categoria,
      nome: r.nome,
      unidade: r.unidade,
      preco_medio: r.preco_medio === null ? null : Number(r.preco_medio),
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
