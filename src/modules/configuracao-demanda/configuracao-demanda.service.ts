import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateConfiguracaoDemandaDto } from './dto/create-configuracao-demanda.dto';
import { UpdateConfiguracaoDemandaDto } from './dto/update-configuracao-demanda.dto';

@Injectable()
export class ConfiguracaoDemandaService {
  constructor(private prisma: PrismaService) {}

  /**
   * Busca configuração por unidade
   */
  async findByUnidade(unidadeId: string) {
    try {
      const configuracao = await this.prisma.$queryRaw<any[]>`
        SELECT
          c.id,
          c.unidade_id,
          c.fonte,
          c.equipamentos_ids,
          c.mostrar_detalhes,
          c.intervalo_atualizacao,
          c.aplicar_perdas,
          c.fator_perdas,
          c.valor_contratado,
          c.percentual_adicional,
          c.created_at,
          c.updated_at,
          u.nome as unidade_nome
        FROM configuracao_demanda c
        JOIN unidades u ON u.id = c.unidade_id
        WHERE c.unidade_id = ${unidadeId}
        LIMIT 1
      `;

      if (!configuracao || configuracao.length === 0) {
        console.log(`📊 Nenhuma configuração encontrada para unidade ${unidadeId}`);
        return null;
      }

      const config = configuracao[0];

      // Limpar espaços dos campos de texto (PostgreSQL char fields podem ter padding)
      if (config.id && typeof config.id === 'string') {
        config.id = config.id.trim();
      }
      if (config.unidade_id && typeof config.unidade_id === 'string') {
        config.unidade_id = config.unidade_id.trim();
      }

      // Parse JSON field se necessário
      if (typeof config.equipamentos_ids === 'string') {
        config.equipamentos_ids = JSON.parse(config.equipamentos_ids);
      }

      console.log(`📊 Configuração encontrada para unidade ${unidadeId}:`, config.id);
      return config;
    } catch (error) {
      // Se o erro for porque a unidade não existe, retornar null para permitir criação
      console.log(`⚠️ Aviso ao buscar configuração: ${error.message}`);

      // Verificar se é apenas uma query vazia (sem resultados) - não é um erro real
      if (error.message && error.message.includes('No data returned')) {
        console.log(`📊 Nenhuma configuração encontrada para unidade ${unidadeId} (query vazia)`);
        return null;
      }

      // Para outros erros reais, ainda lanç-los
      console.error('Erro ao buscar configuração:', error);
      // Mas vamos retornar null ao invés de lançar erro para permitir criação
      return null;
    }
  }

  /**
   * Lista todas as configurações
   */
  async findAll() {
    try {
      const configuracoes = await this.prisma.$queryRaw<any[]>`
        SELECT
          c.id,
          c.unidade_id,
          c.fonte,
          c.equipamentos_ids,
          c.mostrar_detalhes,
          c.intervalo_atualizacao,
          c.aplicar_perdas,
          c.fator_perdas,
          c.valor_contratado,
          c.percentual_adicional,
          c.created_at,
          c.updated_at,
          u.nome as unidade_nome,
          p.nome as planta_nome
        FROM configuracao_demanda c
        JOIN unidades u ON u.id = c.unidade_id
        JOIN plantas p ON p.id = u.planta_id
        ORDER BY p.nome, u.nome
      `;

      // Parse JSON fields
      return configuracoes.map(config => {
        if (typeof config.equipamentos_ids === 'string') {
          config.equipamentos_ids = JSON.parse(config.equipamentos_ids);
        }
        return config;
      });
    } catch (error) {
      console.error('Erro ao listar configurações:', error);
      throw new BadRequestException('Erro ao listar configurações');
    }
  }

  /**
   * Cria nova configuração
   */
  async create(data: CreateConfiguracaoDemandaDto, userId?: string) {
    try {
      // Verificar se unidade existe
      const unidade = await this.prisma.unidades.findUnique({
        where: { id: data.unidade_id }
      });

      if (!unidade) {
        throw new NotFoundException('Unidade não encontrada');
      }

      // Verificar se já existe configuração para esta unidade
      const existing = await this.findByUnidade(data.unidade_id);
      if (existing) {
        throw new BadRequestException('Já existe configuração para esta unidade');
      }

      // Gerar ID único
      const id = 'cfg' + Date.now().toString(36) + Math.random().toString(36).substr(2);
      const now = new Date();

      await this.prisma.$executeRaw`
        INSERT INTO configuracao_demanda (
          id,
          unidade_id,
          fonte,
          equipamentos_ids,
          mostrar_detalhes,
          intervalo_atualizacao,
          aplicar_perdas,
          fator_perdas,
          valor_contratado,
          percentual_adicional,
          created_at,
          updated_at,
          created_by
        ) VALUES (
          ${id},
          ${data.unidade_id},
          ${data.fonte || 'AGRUPAMENTO'},
          ${JSON.stringify((data.equipamentos_ids || []).map((id: string) => id.trim()))}::json,
          ${data.mostrar_detalhes !== false},
          ${data.intervalo_atualizacao || 30},
          ${data.aplicar_perdas !== false},
          ${data.fator_perdas || 3.0},
          ${data.valor_contratado || null},
          ${data.percentual_adicional || 10.0},
          ${now},
          ${now},
          ${userId || null}
        )
      `;

      return {
        id,
        ...data,
        created_at: now,
        updated_at: now,
        message: 'Configuração criada com sucesso'
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Erro ao criar configuração:', error);
      throw new BadRequestException('Erro ao criar configuração');
    }
  }

  /**
   * Atualiza configuração existente
   */
  async update(id: string, data: UpdateConfiguracaoDemandaDto, userId?: string) {
    console.log('\n⚠️ [SERVICE] update() chamado com ID:', id);
    console.log('  - Este ID parece ser unidadeId?', id.startsWith('cmh'));

    try {
      // Verificar se configuração existe
      const existing = await this.prisma.$queryRaw<any[]>`
        SELECT id FROM configuracao_demanda WHERE id = ${id}
      `;

      if (!existing || existing.length === 0) {
        console.error('❌ [SERVICE] Configuração não encontrada para ID:', id);
        throw new NotFoundException('Configuração não encontrada');
      }

      const now = new Date();
      const updates = [];
      const values = [];

      if (data.fonte !== undefined) {
        updates.push('fonte = $' + (values.length + 1));
        values.push(data.fonte);
      }

      if (data.equipamentos_ids !== undefined) {
        // Limpar espaços dos IDs antes de salvar
        console.log('  📝 [SERVICE-UPDATE] Atualizando equipamentos_ids:', data.equipamentos_ids);
        const equipamentosIdsTrimmed = data.equipamentos_ids.map((id: string) => id.trim());
        console.log('  📝 [SERVICE-UPDATE] IDs limpos:', equipamentosIdsTrimmed);
        updates.push('equipamentos_ids = $' + (values.length + 1) + '::json');
        values.push(JSON.stringify(equipamentosIdsTrimmed));
      }

      if (data.mostrar_detalhes !== undefined) {
        updates.push('mostrar_detalhes = $' + (values.length + 1));
        values.push(data.mostrar_detalhes);
      }

      if (data.intervalo_atualizacao !== undefined) {
        updates.push('intervalo_atualizacao = $' + (values.length + 1));
        values.push(data.intervalo_atualizacao);
      }

      if (data.aplicar_perdas !== undefined) {
        updates.push('aplicar_perdas = $' + (values.length + 1));
        values.push(data.aplicar_perdas);
      }

      if (data.fator_perdas !== undefined) {
        updates.push('fator_perdas = $' + (values.length + 1));
        values.push(data.fator_perdas);
      }

      if (data.valor_contratado !== undefined) {
        updates.push('valor_contratado = $' + (values.length + 1));
        values.push(data.valor_contratado);
      }

      if (data.percentual_adicional !== undefined) {
        updates.push('percentual_adicional = $' + (values.length + 1));
        values.push(data.percentual_adicional);
      }

      // Sempre atualizar updated_at e updated_by
      updates.push('updated_at = $' + (values.length + 1));
      values.push(now);

      if (userId) {
        updates.push('updated_by = $' + (values.length + 1));
        values.push(userId);
      }

      // Adicionar o ID no final
      values.push(id);

      const query = `
        UPDATE configuracao_demanda
        SET ${updates.join(', ')}
        WHERE id = $${values.length}
      `;

      await this.prisma.$executeRawUnsafe(query, ...values);

      return {
        id,
        ...data,
        updated_at: now,
        message: 'Configuração atualizada com sucesso'
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao atualizar configuração:', error);
      throw new BadRequestException('Erro ao atualizar configuração');
    }
  }

  /**
   * Atualiza configuração por unidade_id (cria se não existir)
   */
  async updateByUnidade(unidadeId: string, data: UpdateConfiguracaoDemandaDto, userId?: string) {
    console.log('\n🔍 [SERVICE] updateByUnidade iniciado');
    console.log('  - unidadeId:', unidadeId);
    console.log('  - data:', JSON.stringify(data, null, 2));
    console.log('  - userId:', userId);

    try {
      // Buscar configuração existente
      console.log('📊 [SERVICE] Buscando configuração existente...');
      const config = await this.findByUnidade(unidadeId);
      console.log('  - Configuração encontrada?', config ? 'SIM' : 'NÃO');

      if (!config) {
        console.log(`📝 [SERVICE] Criando nova configuração para unidade ${unidadeId}`);
        console.log('  📝 [SERVICE-CREATE] equipamentos_ids recebidos:', data.equipamentos_ids);
        console.log('  📝 [SERVICE-CREATE] quantidade de IDs:', data.equipamentos_ids?.length || 0);

        // Se não existe, criar nova configuração
        // Remover check de duplicação no create() para permitir criação
        const id = 'cfg' + Date.now().toString(36) + Math.random().toString(36).substr(2);
        const now = new Date();

        await this.prisma.$executeRaw`
          INSERT INTO configuracao_demanda (
            id,
            unidade_id,
            fonte,
            equipamentos_ids,
            mostrar_detalhes,
            intervalo_atualizacao,
            aplicar_perdas,
            fator_perdas,
            valor_contratado,
            percentual_adicional,
            created_at,
            updated_at,
            created_by
          ) VALUES (
            ${id},
            ${unidadeId},
            ${data.fonte || 'AGRUPAMENTO'},
            ${(() => {
              const ids = (data.equipamentos_ids || []).map((id: string) => id.trim());
              console.log('  📝 [SERVICE-CREATE-SQL] Salvando IDs limpos no banco:', ids);
              return JSON.stringify(ids);
            })()}::json,
            ${data.mostrar_detalhes !== false},
            ${data.intervalo_atualizacao || 30},
            ${data.aplicar_perdas !== false},
            ${data.fator_perdas || 3.0},
            ${data.valor_contratado || null},
            ${data.percentual_adicional || 10.0},
            ${now},
            ${now},
            ${userId || null}
          )
        `;

        return {
          id,
          unidade_id: unidadeId,
          ...data,
          created_at: now,
          updated_at: now,
          message: 'Configuração criada com sucesso'
        };
      }

      console.log(`📝 Atualizando configuração ${config.id} para unidade ${unidadeId}`);
      console.log(`  - ID com trim: '${config.id}'`);
      console.log(`  - ID length: ${config.id.length}`);

      // Se existe, atualizar
      return this.update(config.id, data, userId);
    } catch (error) {
      console.error('❌ Erro ao atualizar/criar configuração por unidade:', error);

      // Se for erro específico, relançar
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      // Erro genérico
      throw new BadRequestException('Erro ao salvar configuração de demanda');
    }
  }

  /**
   * Remove configuração
   */
  async remove(id: string) {
    try {
      const result = await this.prisma.$executeRaw`
        DELETE FROM configuracao_demanda WHERE id = ${id}
      `;

      if (result === 0) {
        throw new NotFoundException('Configuração não encontrada');
      }

      return { message: 'Configuração removida com sucesso' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Erro ao remover configuração:', error);
      throw new BadRequestException('Erro ao remover configuração');
    }
  }
}