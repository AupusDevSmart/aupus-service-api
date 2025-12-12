/**
 * Script para salvar dados parciais já extraídos
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('========================================');
  console.log(' EXTRAÇÃO DE DADOS REAIS - SIMPLIFICADA');
  console.log('========================================\n');

  const dados: any = {};

  try {
    // === USUÁRIOS ===
    console.log('📋 Extraindo usuários...');
    dados.usuarios = await prisma.$queryRaw`
      SELECT id, nome, email, role
      FROM usuarios
      WHERE deleted_at IS NULL
      LIMIT 25
    `;
    console.log(`✓ ${(dados.usuarios as any[]).length} usuários\n`);

    // === PLANTAS ===
    console.log('🏭 Extraindo plantas...');
    dados.plantas = await prisma.$queryRaw`
      SELECT id, nome, cidade, uf
      FROM plantas
      WHERE deleted_at IS NULL
      LIMIT 15
    `;
    console.log(`✓ ${(dados.plantas as any[]).length} plantas\n`);

    // === UNIDADES ===
    console.log('🏢 Extraindo unidades...');
    dados.unidades = await prisma.$queryRaw`
      SELECT u.id, u.nome, u.tipo, u.status, u.planta_id
      FROM unidades u
      WHERE u.deleted_at IS NULL
      LIMIT 25
    `;
    console.log(`✓ ${(dados.unidades as any[]).length} unidades\n`);

    // === EQUIPAMENTOS ===
    console.log('⚙️  Extraindo equipamentos...');
    dados.equipamentos = await prisma.$queryRaw`
      SELECT e.id, e.nome, e.status, e.unidade_id, e.planta_id
      FROM equipamentos e
      WHERE e.deleted_at IS NULL
      LIMIT 30
    `;
    console.log(`✓ ${(dados.equipamentos as any[]).length} equipamentos\n`);

    // === PLANOS ===
    console.log('📝 Extraindo planos de manutenção...');
    dados.planos = await prisma.$queryRaw`
      SELECT pm.id, pm.nome, pm.status, pm.equipamento_id
      FROM planos_manutencao pm
      WHERE pm.deleted_at IS NULL AND pm.status = 'ATIVO'
      LIMIT 20
    `;
    console.log(`✓ ${(dados.planos as any[]).length} planos\n`);

    // === TAREFAS ===
    console.log('✅ Extraindo tarefas...');
    dados.tarefas = await prisma.$queryRaw`
      SELECT t.id, t.descricao, t.status, t.plano_manutencao_id, t.equipamento_id
      FROM tarefas t
      WHERE t.deleted_at IS NULL AND t.status = 'ATIVA'
      LIMIT 35
    `;
    console.log(`✓ ${(dados.tarefas as any[]).length} tarefas\n`);

    // === ANOMALIAS ===
    console.log('⚠️  Extraindo anomalias...');
    dados.anomalias = await prisma.$queryRaw`
      SELECT a.id, a.descricao, a.status, a.prioridade, a.equipamento_id, a.planta_id
      FROM anomalias a
      WHERE a.deleted_at IS NULL
      LIMIT 25
    `;
    console.log(`✓ ${(dados.anomalias as any[]).length} anomalias\n`);

    // === PROGRAMAÇÕES OS ===
    console.log('📅 Extraindo programações OS...');
    dados.programacoes = await prisma.$queryRaw`
      SELECT prog.id, prog.status, prog.planta_id, prog.anomalia_id
      FROM programacoes_os prog
      LIMIT 25
    `;
    console.log(`✓ ${(dados.programacoes as any[]).length} programações\n`);

    // === ORDENS DE SERVIÇO ===
    console.log('🔧 Extraindo ordens de serviço...');
    dados.ordensServico = await prisma.$queryRaw`
      SELECT os.id, os.numero_os, os.status, os.planta_id, os.programacao_id
      FROM ordens_servico os
      LIMIT 25
    `;
    console.log(`✓ ${(dados.ordensServico as any[]).length} ordens de serviço\n`);

    // === NOTA: Veículos e Reservas não existem no schema atual ===
    dados.veiculos = [];
    dados.reservas = [];

    // === SALVAR ===
    const outputPath = path.join(__dirname, '..', '..', '..', 'scripts-teste', 'dados-extraidos.json');
    fs.writeFileSync(outputPath, JSON.stringify(dados, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2));

    console.log('========================================');
    console.log('          ✅ CONCLUÍDO!                  ');
    console.log('========================================\n');
    console.log(`Arquivo salvo: ${outputPath}\n`);
    console.log('📊 Resumo dos dados extraídos:');
    console.log(`  • ${dados.usuarios?.length || 0} usuários`);
    console.log(`  • ${dados.plantas?.length || 0} plantas`);
    console.log(`  • ${dados.unidades?.length || 0} unidades`);
    console.log(`  • ${dados.equipamentos?.length || 0} equipamentos`);
    console.log(`  • ${dados.planos?.length || 0} planos`);
    console.log(`  • ${dados.tarefas?.length || 0} tarefas`);
    console.log(`  • ${dados.anomalias?.length || 0} anomalias`);
    console.log(`  • ${dados.programacoes?.length || 0} programações`);
    console.log(`  • ${dados.ordensServico?.length || 0} ordens de serviço`);
    console.log(`  • ${dados.veiculos?.length || 0} veículos`);
    console.log(`  • ${dados.reservas?.length || 0} reservas\n`);

  } catch (error) {
    console.error('\n❌ Erro:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
