// ===============================
// src/modules/ferramentas/services/calibracao.service.ts
// ===============================
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateCalibracaoDto } from '../dto/create-calibracao.dto';

@Injectable()
export class CalibracaoService {
  constructor(private prisma: PrismaService) {}

  async create(ferramentaId: string, createCalibracaoDto: CreateCalibracaoDto, criadoPor: string) {
    // Verificar se ferramenta existe
    const ferramenta = await this.prisma.ferramentas.findFirst({
      where: { id: ferramentaId, deleted_at: null },
    });

    if (!ferramenta) {
      throw new NotFoundException('Ferramenta não encontrada');
    }

    // Validar datas
    const dataCalibracao = new Date(createCalibracaoDto.data_calibracao);
    const dataVencimento = new Date(createCalibracaoDto.data_vencimento);

    if (dataVencimento <= dataCalibracao) {
      throw new BadRequestException('Data de vencimento deve ser posterior à data de calibração');
    }

    // Criar registro de calibração
    const calibracao = await this.prisma.historico_calibracoes.create({
      data: {
        ferramenta_id: ferramentaId,
        data_calibracao: dataCalibracao,
        data_vencimento: dataVencimento,
        responsavel: createCalibracaoDto.responsavel,
        certificado_numero: createCalibracaoDto.certificado_numero,
        certificado_url: createCalibracaoDto.certificado_url,
        observacoes: createCalibracaoDto.observacoes,
        custo: createCalibracaoDto.custo,
        criado_por: criadoPor,
      },
      include: {
        criado_por_usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    // Atualizar próxima data de calibração na ferramenta
    await this.prisma.ferramentas.update({
      where: { id: ferramentaId },
      data: {
        proxima_data_calibracao: dataVencimento,
        // Se estava em manutenção por calibração, volta para disponível
        ...(ferramenta.status === 'manutencao' && { status: 'disponivel' }),
      },
    });

    return calibracao;
  }

  async findAll(ferramentaId: string) {
    // Verificar se ferramenta existe
    const ferramenta = await this.prisma.ferramentas.findFirst({
      where: { id: ferramentaId, deleted_at: null },
    });

    if (!ferramenta) {
      throw new NotFoundException('Ferramenta não encontrada');
    }

    const calibracoes = await this.prisma.historico_calibracoes.findMany({
      where: { ferramenta_id: ferramentaId },
      include: {
        criado_por_usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
      orderBy: { data_calibracao: 'desc' },
    });

    return { data: calibracoes };
  }
}