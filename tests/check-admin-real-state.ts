// Verificar estado REAL do admin@email.com no banco
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAdminState() {
  console.log('🔍 Verificando estado REAL de admin@email.com no banco...\n');
  console.log('='.repeat(80));

  try {
    // 1. Buscar usuário admin@email.com
    const usuario = await prisma.usuarios.findUnique({
      where: { email: 'admin@email.com' }
    });

    if (!usuario) {
      console.log('❌ Usuário admin@email.com não encontrado!');
      return;
    }

    console.log('\n📊 DADOS DO USUÁRIO NA TABELA usuarios:');
    console.log('   ID:', usuario.id);
    console.log('   Nome:', usuario.nome);
    console.log('   Email:', usuario.email);
    console.log('   Status:', usuario.status);
    console.log('   Role (coluna legacy):', usuario.role || 'NULL/N/A');
    console.log('   Created:', usuario.created_at);
    console.log('   Updated:', usuario.updated_at);

    // 2. Buscar roles via Spatie (model_has_roles)
    console.log('\n📊 ROLES NO SISTEMA SPATIE (tabela model_has_roles):');
    const modelHasRoles = await prisma.$queryRaw`
      SELECT
        mhr.role_id,
        r.name as role_name,
        r.guard_name,
        r.id as role_table_id
      FROM model_has_roles mhr
      JOIN roles r ON r.id = mhr.role_id
      WHERE mhr.model_type = 'App\\Models\\Usuario'
        AND mhr.model_id = ${usuario.id}
    `;

    if (Array.isArray(modelHasRoles) && modelHasRoles.length > 0) {
      modelHasRoles.forEach((role: any) => {
        console.log(`   - ${role.role_name} (ID: ${role.role_id}, Guard: ${role.guard_name})`);
      });
    } else {
      console.log('   ⚠️  Nenhuma role encontrada no sistema Spatie');
    }

    // 3. Buscar permissions diretas (model_has_permissions)
    console.log('\n📊 PERMISSIONS DIRETAS (tabela model_has_permissions):');
    const modelHasPerms = await prisma.$queryRaw`
      SELECT
        mhp.permission_id,
        p.name as permission_name,
        p.guard_name
      FROM model_has_permissions mhp
      JOIN permissions p ON p.id = mhp.permission_id
      WHERE mhp.model_type = 'App\\Models\\Usuario'
        AND mhp.model_id = ${usuario.id}
      LIMIT 10
    `;

    if (Array.isArray(modelHasPerms) && modelHasPerms.length > 0) {
      console.log(`   Total: ${modelHasPerms.length} permissions diretas`);
      modelHasPerms.forEach((perm: any, index: number) => {
        if (index < 5) {
          console.log(`   - ${perm.permission_name}`);
        }
      });
      if (modelHasPerms.length > 5) {
        console.log(`   ... e mais ${modelHasPerms.length - 5}`);
      }
    } else {
      console.log('   ⚠️  Nenhuma permission direta');
    }

    // 4. Buscar permissions via role (role_has_permissions)
    console.log('\n📊 PERMISSIONS VIA ROLES (tabela role_has_permissions):');
    const rolePerms = await prisma.$queryRaw`
      SELECT
        p.name as permission_name,
        r.name as role_name,
        COUNT(*) OVER() as total_count
      FROM role_has_permissions rhp
      JOIN permissions p ON p.id = rhp.permission_id
      JOIN roles r ON r.id = rhp.role_id
      WHERE rhp.role_id IN (
        SELECT role_id
        FROM model_has_roles
        WHERE model_type = 'App\\Models\\Usuario'
          AND model_id = ${usuario.id}
      )
      LIMIT 10
    `;

    if (Array.isArray(rolePerms) && rolePerms.length > 0) {
      const total = (rolePerms[0] as any).total_count;
      console.log(`   Total: ${total} permissions via roles`);
      rolePerms.forEach((perm: any, index: number) => {
        if (index < 5) {
          console.log(`   - ${perm.permission_name} (via ${perm.role_name})`);
        }
      });
      if (rolePerms.length > 5) {
        console.log(`   ... e mais ${Number(total) - 5}`);
      }
    } else {
      console.log('   ⚠️  Nenhuma permission via roles');
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Verificação completa!');

  } catch (error: any) {
    console.error('\n❌ Erro:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminState().catch(console.error);
