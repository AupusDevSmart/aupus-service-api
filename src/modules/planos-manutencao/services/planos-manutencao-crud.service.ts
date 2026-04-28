// src/modules/planos-manutencao/services/planos-manutencao-crud.service.ts
import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '@aupus/api-shared';
import { StatusPlano } from '@aupus/api-shared';
import {
  CreatePlanoManutencaoDto,
  UpdatePlanoManutencaoDto,
  UpdateStatusPlanoDto,
  PlanoManutencaoResponseDto
} from '../dto';
import { PlanosManutencaoValidators } from '../helpers/planos-manutencao.validators';
import { PlanosIncludeBuilder } from '../builders/planos-include.builder';
import { converterStringParaDate } from '../helpers/planos-manutencao.helpers';
import { PlanosManutencaoMapper } from './planos-manutencao.mapper';

@Injectable()
export class PlanosManutencaoCrudService {
  private validators: PlanosManutencaoValidators;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: PlanosManutencaoMapper
  ) {
    this.validators = new PlanosManutencaoValidators(prisma);
  }

  async criar(createDto: CreatePlanoManutencaoDto): Promise<PlanoManutencaoResponseDto> {
    // Verificar se equipamento existe
    await this.validators.verificarEquipamentoExiste(createDto.equipamento_id);

    // Verificar se equipamento já tem plano (constraint unique)
    const planoExistente = await this.prisma.planos_manutencao.findFirst({
      where: {
        equipamento_id: createDto.equipamento_id,
        deleted_at: null
      }
    });

    if (planoExistente) {
      throw new ConflictException('Este equipamento já possui um plano de manutenção');
    }

    // Converter datas string para Date objects
    const dados = {
      ...createDto,
      versao: createDto.versao || '1.0',
      status: createDto.status || StatusPlano.ATIVO,
      ativo: createDto.ativo !== undefined ? createDto.ativo : true,
      data_vigencia_inicio: createDto.data_vigencia_inicio
        ? converterStringParaDate(createDto.data_vigencia_inicio)
        : null,
      data_vigencia_fim: createDto.data_vigencia_fim
        ? converterStringParaDate(createDto.data_vigencia_fim)
        : null
    };

    const plano = await this.prisma.planos_manutencao.create({
      data: dados,
      include: PlanosIncludeBuilder.relacionamentosBasicos()
    });

    return this.mapper.mapearParaResponse(plano);
  }

  async buscarPorId(id: string, incluirTarefas = false): Promise<PlanoManutencaoResponseDto> {
    const includeOptions = incluirTarefas
      ? PlanosIncludeBuilder.comTarefasDetalhadas()
      : PlanosIncludeBuilder.relacionamentosBasicos();

    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      },
      include: includeOptions
    });

    if (!plano) {
      await this.validators.verificarPlanoExiste(id); // Lança exceção
    }

    return this.mapper.mapearParaResponse(plano);
  }

  async atualizar(id: string, updateDto: UpdatePlanoManutencaoDto): Promise<PlanoManutencaoResponseDto> {
    await this.validators.verificarPlanoExiste(id);

    // Se mudou equipamento, verificar se novo equipamento já tem plano
    if (updateDto.equipamento_id) {
      await this.validators.verificarEquipamentoExiste(updateDto.equipamento_id);

      const planoExistente = await this.prisma.planos_manutencao.findFirst({
        where: {
          equipamento_id: updateDto.equipamento_id,
          id: { not: id },
          deleted_at: null
        }
      });

      if (planoExistente) {
        throw new ConflictException('O equipamento selecionado já possui um plano de manutenção');
      }
    }

    // Preparar dados com conversão de datas
    const dadosAtualizacao: any = {
      ...updateDto,
      updated_at: new Date()
    };

    // Converter datas se existirem no DTO
    if (updateDto.data_vigencia_inicio !== undefined) {
      dadosAtualizacao.data_vigencia_inicio = updateDto.data_vigencia_inicio
        ? converterStringParaDate(updateDto.data_vigencia_inicio)
        : null;
    }

    if (updateDto.data_vigencia_fim !== undefined) {
      dadosAtualizacao.data_vigencia_fim = updateDto.data_vigencia_fim
        ? converterStringParaDate(updateDto.data_vigencia_fim)
        : null;
    }

    const plano = await this.prisma.planos_manutencao.update({
      where: { id },
      data: dadosAtualizacao,
      include: PlanosIncludeBuilder.relacionamentosBasicos()
    });

    return this.mapper.mapearParaResponse(plano);
  }

  async atualizarStatus(id: string, updateStatusDto: UpdateStatusPlanoDto): Promise<PlanoManutencaoResponseDto> {
    await this.validators.verificarPlanoExiste(id);

    const plano = await this.prisma.planos_manutencao.update({
      where: { id },
      data: {
        status: updateStatusDto.status,
        ativo: updateStatusDto.status === StatusPlano.ATIVO,
        atualizado_por: updateStatusDto.atualizado_por,
        updated_at: new Date()
      },
      include: PlanosIncludeBuilder.relacionamentosBasicos()
    });

    return this.mapper.mapearParaResponse(plano);
  }

  async remover(id: string): Promise<void> {
    await this.validators.verificarPlanoExiste(id);

    // Soft delete - também marca tarefas como removidas
    await this.prisma.$transaction(async (tx) => {
      // Remover tarefas do plano
      await tx.tarefas.updateMany({
        where: { plano_manutencao_id: id },
        data: { deleted_at: new Date() }
      });

      // Remover plano
      await tx.planos_manutencao.update({
        where: { id },
        data: { deleted_at: new Date() }
      });
    });
  }
}
