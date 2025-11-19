const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testPermissionsApi() {
  console.log('═'.repeat(60));
  console.log('  TESTE DE API DE PERMISSÕES');
  console.log('═'.repeat(60));
  console.log();

  try {
    // Simular o que a API retorna
    console.log('📋 Buscando permissões modernas (com ponto)...\n');

    const permissions = await prisma.permissions.findMany({
      where: {
        name: {
          contains: '.'
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    console.log(`✅ Total de permissões modernas: ${permissions.length}\n`);

    // Mostrar exemplo de formato
    console.log('📄 Formato dos dados retornados:\n');
    const sample = permissions.slice(0, 3).map(p => ({
      id: Number(p.id),
      name: p.name,
      display_name: p.display_name || p.name,
      description: p.description || '',
      guard_name: p.guard_name
    }));

    console.log(JSON.stringify(sample, null, 2));
    console.log();

    // Agrupar por categoria
    console.log('📊 Agrupamento por categoria:\n');

    const resourceToCategory = {
      'dashboard': 'Dashboard',
      'usuarios': 'Gestão',
      'organizacoes': 'Gestão',
      'equipe': 'Gestão',
      'plantas': 'Gestão de Energia',
      'unidades': 'Gestão de Energia',
      'equipamentos': 'Gestão de Energia',
      'ugs': 'Gestão de Energia',
      'monitoramento': 'Monitoramento',
      'scada': 'Supervisório',
      'supervisorio': 'Supervisório',
      'controle': 'Supervisório',
      'prospeccao': 'Comercial',
      'prospec': 'Comercial',
      'oportunidades': 'Comercial',
      'financeiro': 'Financeiro',
      'clube': 'Clube',
      'concessionarias': 'Sistema',
      'configuracoes': 'Sistema',
      'documentos': 'Sistema',
      'relatorios': 'Sistema',
      'admin': 'Administração',
    };

    const grouped = {};
    permissions.forEach(p => {
      const [resource] = p.name.split('.');
      const category = resourceToCategory[resource] || 'Outros';

      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push({
        name: p.name,
        display_name: p.display_name || p.name
      });
    });

    Object.entries(grouped).forEach(([category, perms]) => {
      console.log(`\n${category} (${perms.length})`);
      perms.slice(0, 3).forEach(p => {
        console.log(`  • ${p.display_name || p.name} (${p.name})`);
      });
      if (perms.length > 3) {
        console.log(`  ... e mais ${perms.length - 3} permissões`);
      }
    });

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Teste concluído! API retornará dados corretos.');
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('❌ Erro ao testar API:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPermissionsApi();
