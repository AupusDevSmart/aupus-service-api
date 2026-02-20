const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analisarCampos() {
  try {
    const eq = await prisma.equipamentos.findFirst({ where: { nome: 'P666' } });
    const ultimo = await prisma.equipamentos_dados.findFirst({
      where: { equipamento_id: eq.id },
      orderBy: { timestamp_dados: 'desc' },
      select: { timestamp_dados: true, dados: true }
    });

    const d = ultimo.dados;

    console.log('\n📊 ANÁLISE COMPLETA DOS CAMPOS M-160\n');
    console.log('⏰ Timestamp:', ultimo.timestamp_dados.toISOString());
    console.log('');

    console.log('=== TENSÕES ===');
    console.log('Va (Fase A):', d.Va, 'V');
    console.log('Vb (Fase B):', d.Vb, 'V');
    console.log('Vc (Fase C):', d.Vc, 'V');
    console.log('');

    console.log('=== CORRENTES ===');
    console.log('Ia (Fase A):', d.Ia, 'A');
    console.log('Ib (Fase B):', d.Ib, 'A');
    console.log('Ic (Fase C):', d.Ic, 'A');
    console.log('');

    console.log('=== POTÊNCIAS ===');
    console.log('Pt (Ativa Total):', d.Pt, 'W →', (d.Pt / 1000).toFixed(2), 'kW');
    console.log('Qt (Reativa Total):', d.Qt, 'VAr →', (d.Qt / 1000).toFixed(2), 'kvar');
    console.log('St (Aparente Total):', d.St, 'VA →', (d.St / 1000).toFixed(2), 'kva');
    console.log('');

    console.log('=== FATOR DE POTÊNCIA ===');
    console.log('FPa (Fase A - minúsculo):', d.FPa);
    console.log('FPb (Fase B - minúsculo):', d.FPb);
    console.log('FPc (Fase C - minúsculo):', d.FPc);
    console.log('FPA (Fase A - MAIÚSCULO):', d.FPA);
    console.log('FPB (Fase B - MAIÚSCULO):', d.FPB);
    console.log('FPC (Fase C - MAIÚSCULO):', d.FPC);
    console.log('FP Total (Pt/St):', d.St > 0 ? (d.Pt / d.St).toFixed(3) : 0);
    console.log('');

    console.log('=== ENERGIA ACUMULADA ===');
    console.log('phf (Ativa Import):', d.phf, 'kWh');
    console.log('phr (Ativa Export):', d.phr || 0, 'kWh');
    console.log('consumo_phf:', d.consumo_phf || 0);
    console.log('consumo_phr:', d.consumo_phr || 0);
    console.log('consumo_qhf:', d.consumo_qhf || 0);
    console.log('consumo_qhr:', d.consumo_qhr || 0);
    console.log('');

    console.log('=== PROBLEMA ENCONTRADO NO MODAL ===');
    console.log('❌ LINHA 190 do modal: powerFactor: d.FPA || 0');
    console.log('   Deveria ser: powerFactor: d.FPa || d.FPA || 0');
    console.log('');
    console.log('❌ LINHA 191 do modal: powerFactorB: d.FPB || 0');
    console.log('   Deveria ser: powerFactorB: d.FPb || d.FPB || 0');
    console.log('');
    console.log('❌ LINHA 192 do modal: powerFactorC: d.FPC || 0');
    console.log('   Deveria ser: powerFactorC: d.FPc || d.FPC || 0');
    console.log('');
    console.log('=== VERIFICAÇÃO ===');
    const temDados = d.Dados !== undefined;
    const temFPa = d.FPa !== undefined;
    const temFPA = d.FPA !== undefined;
    console.log('Tem d.Dados (legado)?', temDados);
    console.log('Tem d.FPa (novo)?', temFPa);
    console.log('Tem d.FPA (legado)?', temFPA);

    console.log('\n=== FORMATO ATUAL ===');
    if (temDados) {
      console.log('FORMATO LEGADO (d.Dados existe)');
      console.log('FPA dentro de Dados:', d.Dados.FPA);
    } else if (temFPa) {
      console.log('FORMATO NOVO (d.FPa na raiz)');
      console.log('FPa:', d.FPa);
    }

  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

analisarCampos();
