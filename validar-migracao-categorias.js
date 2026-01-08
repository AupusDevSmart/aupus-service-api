const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 VALIDAÇÃO DA MIGRAÇÃO - HIERARQUIA CATEGORIAS\n');
  console.log('='.repeat(80));

  // 1. Verificar categorias criadas
  console.log('\n✅ STEP 1: Verificar categorias criadas');
  const categorias = await prisma.$queryRaw`
    SELECT id, nome FROM categorias_equipamentos ORDER BY nome
  `;
  console.log(`   Total de categorias: ${categorias.length}`);
  categorias.forEach(cat => {
    console.log(`   - ${cat.nome} (${cat.id})`);
  });

  // 2. Verificar campos adicionados em tipos_equipamentos
  console.log('\n✅ STEP 2: Verificar campos em tipos_equipamentos');
  const tipos = await prisma.$queryRaw`
    SELECT
      te.codigo,
      te.nome,
      te.categoria_id,
      te.fabricante,
      ce.nome as categoria_nome
    FROM tipos_equipamentos te
    LEFT JOIN categorias_equipamentos ce ON te.categoria_id = ce.id
    WHERE te.codigo IN ('METER_M160', 'INVERSOR', 'PIVO', 'TRANSFORMADOR', 'DISJUNTOR', 'MOTOR')
    ORDER BY te.nome
  `;
  console.log(`   Total de tipos verificados: ${tipos.length}`);
  tipos.forEach(tipo => {
    console.log(`   [${tipo.codigo}] ${tipo.nome}`);
    console.log(`      Categoria: ${tipo.categoria_nome || 'N/A'}`);
    console.log(`      Fabricante: ${tipo.fabricante || 'N/A'}`);
  });

  // 3. Verificar tipos com MQTT ATIVO (CRÍTICOS)
  console.log('\n⚡ STEP 3: Verificar tipos MQTT CRÍTICOS');
  const tiposMqtt = await prisma.$queryRaw`
    SELECT
      te.codigo,
      te.nome,
      te.fabricante,
      ce.nome as categoria_nome,
      COUNT(e.id) as total_equipamentos,
      COUNT(CASE WHEN e.mqtt_habilitado = true THEN 1 END) as com_mqtt
    FROM tipos_equipamentos te
    LEFT JOIN categorias_equipamentos ce ON te.categoria_id = ce.id
    LEFT JOIN equipamentos e ON e.tipo_equipamento_id = te.id AND e.deleted_at IS NULL
    WHERE te.codigo IN ('METER_M160', 'INVERSOR', 'PIVO')
    GROUP BY te.id, te.codigo, te.nome, te.fabricante, ce.nome
    ORDER BY te.codigo
  `;

  tiposMqtt.forEach(tipo => {
    console.log(`   [${tipo.codigo}] ${tipo.nome}`);
    console.log(`      Categoria: ${tipo.categoria_nome}`);
    console.log(`      Fabricante: ${tipo.fabricante}`);
    console.log(`      Equipamentos: ${tipo.total_equipamentos} total, ${tipo.com_mqtt} com MQTT`);
    console.log(`      Status: ${tipo.com_mqtt > 0 ? '🔴 CRÍTICO - MQTT ATIVO' : '✅ OK'}`);
  });

  // 4. Verificar campo fabricante_custom em equipamentos
  console.log('\n✅ STEP 4: Verificar fabricante_custom em equipamentos');
  const equipamentosCustom = await prisma.$queryRaw`
    SELECT
      e.nome,
      e.fabricante as fabricante_original,
      e.fabricante_custom,
      te.fabricante as fabricante_modelo
    FROM equipamentos e
    JOIN tipos_equipamentos te ON e.tipo_equipamento_id = te.id
    WHERE e.fabricante_custom IS NOT NULL
    LIMIT 10
  `;
  console.log(`   Equipamentos com fabricante customizado: ${equipamentosCustom.length}`);
  equipamentosCustom.forEach(eq => {
    console.log(`   - ${eq.nome}`);
    console.log(`      Fabricante original: ${eq.fabricante_original}`);
    console.log(`      Fabricante do modelo: ${eq.fabricante_modelo}`);
    console.log(`      Fabricante custom: ${eq.fabricante_custom}`);
  });

  // 5. Verificar tipos SEM categoria (não deveria existir)
  console.log('\n⚠️ STEP 5: Verificar tipos sem categoria');
  const tiposSemCategoria = await prisma.$queryRaw`
    SELECT codigo, nome, categoria_id, fabricante
    FROM tipos_equipamentos
    WHERE categoria_id IS NULL
  `;
  if (tiposSemCategoria.length > 0) {
    console.log(`   ❌ ERRO: ${tiposSemCategoria.length} tipos sem categoria!`);
    tiposSemCategoria.forEach(tipo => {
      console.log(`      - [${tipo.codigo}] ${tipo.nome}`);
    });
  } else {
    console.log('   ✅ Todos os tipos têm categoria definida');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ VALIDAÇÃO CONCLUÍDA\n');

  await prisma.$disconnect();
}

main().catch(console.error);
