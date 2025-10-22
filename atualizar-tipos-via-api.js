const http = require('http');

// Mapeamento de padrões de nome para tipos de equipamento
const TIPO_MAPPINGS = [
  { pattern: /inversor/i, tipoId: '01JAQTE1INVERSOR000000005' },
  { pattern: /transformador/i, tipoId: '01JAQTE1TRANSFORMADOR00007' },
  { pattern: /string.*box/i, tipoId: '01JAQTE1DISJUNTOR0000008' },
  { pattern: /quadro/i, tipoId: '01JAQTE1DISJUNTOR0000008' },
  { pattern: /motor/i, tipoId: '01JAQTE1MOTOR000000000017' },
  { pattern: /medidor/i, tipoId: '01JAQTE1MEDIDOR00000001' },
  { pattern: /m160/i, tipoId: '01JAQTE1M16000000000002' },
  { pattern: /m300/i, tipoId: '01JAQTE1M30000000000003' },
  { pattern: /landis|e750/i, tipoId: '01JAQTE1LANDIS_E750000004' },
  { pattern: /a[-\s]?966/i, tipoId: '01JAQTE1A96600000000013' },
  { pattern: /capacitor/i, tipoId: '01JAQTE1CAPACITOR00000018' },
];

function getTipoEquipamento(nome) {
  for (const mapping of TIPO_MAPPINGS) {
    if (mapping.pattern.test(nome)) {
      return mapping.tipoId;
    }
  }
  return null;
}

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function main() {
  console.log('🔧 Buscando equipamentos UC sem tipo...\n');

  // Buscar equipamentos UC
  const response = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/equipamentos?classificacao=UC&limit=100',
    method: 'GET',
  });

  const equipamentos = response.data?.data || [];
  console.log(`📦 Total de equipamentos UC: ${equipamentos.length}\n`);

  let atualizados = 0;
  let erros = 0;

  for (const eq of equipamentos) {
    const tipoAtual = eq.tipo_equipamento_rel || eq.tipoEquipamento;

    // Pular se já tem tipo
    if (tipoAtual) {
      console.log(`✅ ${eq.nome} - Já tem tipo: ${tipoAtual.codigo}`);
      continue;
    }

    // Determinar tipo baseado no nome
    const novoTipoId = getTipoEquipamento(eq.nome);

    if (!novoTipoId) {
      console.log(`⚠️  ${eq.nome} - Sem correspondência de tipo`);
      continue;
    }

    // Atualizar via API
    try {
      await makeRequest(
        {
          hostname: 'localhost',
          port: 3000,
          path: `/api/v1/equipamentos/${eq.id.trim()}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        { tipo_equipamento_id: novoTipoId }
      );

      console.log(`✅ ${eq.nome} - Atualizado para tipo ${novoTipoId.substring(0, 20)}...`);
      atualizados++;
    } catch (error) {
      console.error(`❌ ${eq.nome} - Erro: ${error.message}`);
      erros++;
    }
  }

  console.log(`\n📊 Resumo:`);
  console.log(`   Atualizados: ${atualizados}`);
  console.log(`   Erros: ${erros}`);
  console.log(`   Total processados: ${equipamentos.length}`);
}

main().catch(console.error);
