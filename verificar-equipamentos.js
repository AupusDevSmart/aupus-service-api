const https = require('http');

const req = https.get('http://localhost:3000/api/v1/equipamentos?classificacao=UC&limit=20', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('Total UC:', json.data?.pagination?.total || 0);
    console.log('\n📦 Equipamentos UC com tipo vinculado:\n');

    json.data?.data?.forEach((e, i) => {
      const tipo = e.tipo_equipamento_rel || e.tipoEquipamento;
      console.log(`${i+1}. ${e.nome}`);
      console.log(`   Tipo: ${tipo ? tipo.codigo + ' - ' + tipo.nome : '❌ SEM TIPO'}`);
      console.log(`   Fabricante: ${e.fabricante || 'N/A'}`);
      console.log(`   Unidade: ${e.unidade?.nome || 'N/A'}\n`);
    });
  });
});

req.on('error', (err) => console.error('Erro:', err.message));
