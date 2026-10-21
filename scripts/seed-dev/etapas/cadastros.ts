import { CreatePlantaDto } from '@/core/modules/plantas/dto/create-planta.dto';
import { CreateUnidadeDto } from '@/core/modules/unidades/dto/create-unidade.dto';
import { CreateUsuarioDto } from '@/core/modules/usuarios/dto/create-usuario.dto';
import { CreateCategoriaEquipamentoDto } from '@/core/modules/categorias-equipamentos/dto/create-categoria-equipamento.dto';
import { UpdateCategoriaEquipamentoDto } from '@/core/modules/categorias-equipamentos/dto/update-categoria-equipamento.dto';
import { CreateTipoEquipamentoDto } from '@/core/modules/tipos-equipamentos/dto/create-tipo-equipamento.dto';
import { ResetPasswordDto } from '@/core/modules/usuarios/dto/reset-password.dto';
import { CreateConfiguracaoDiasUteisDto } from '@/modules/agenda/dto/create-configuracao-dias-uteis.dto';
import { CreateFeriadoDto } from '@/modules/agenda/dto/create-feriado.dto';
import { CreateDocumentacaoVeiculoDto } from '@/modules/veiculos/dto/create-documentacao-veiculo.dto';
import { CreateVeiculoDto } from '@/modules/veiculos/dto/create-veiculo.dto';
import { validar } from '../ambiente';
import { DOMINIO_DO_SEED } from '../apagar';
import type { Cenario, Planta } from '../cenario';
import { pessoa } from '../cenario';
import { CATEGORIAS_DE_LIXO, CATEGORIAS_NOVAS, MODELOS_DE_LIXO, MODELOS_NOVOS, NOMES_CORRIGIDOS, semMojibake } from '../dados/catalogo';
import { DIAS_UTEIS, FERIADOS, VEICULOS } from '../dados/agenda';
import { PESSOAS, emailDe } from '../dados/pessoas';
import { PLANTAS } from '../dados/plantas';
import { as, diaDe, somarDias } from '../tempo';

/**
 * Categorias e modelos: o texto corrompido volta ao certo, o lixo de teste
 * sai e entram os que o cenário usa. O catálogo não é apagado (os ids são os
 * mesmos do NexOn); rodar de novo só confere.
 */
export async function corrigirCatalogo(c: Cenario): Promise<void> {
  const { prisma, s } = c;

  for (const codigo of MODELOS_DE_LIXO) {
    // Sem service de modelo que apague; nenhum equipamento aponta para eles depois do apagar
    await prisma.tipos_equipamentos.deleteMany({ where: { codigo } });
  }
  for (const nome of CATEGORIAS_DE_LIXO) {
    const lixo = await prisma.categorias_equipamentos.findFirst({ where: { nome } });
    if (lixo) await s.categorias.remove(lixo.id);
  }

  let corrigidas = 0;
  for (const categoria of await prisma.categorias_equipamentos.findMany()) {
    const certo = NOMES_CORRIGIDOS[semMojibake(categoria.nome)] ?? semMojibake(categoria.nome);
    if (certo === categoria.nome) continue;
    await s.categorias.update(categoria.id, await validar(UpdateCategoriaEquipamentoDto, { nome: certo }, `categoria ${certo}`));
    corrigidas++;
  }
  for (const nome of CATEGORIAS_NOVAS) {
    if (await prisma.categorias_equipamentos.findFirst({ where: { nome } })) continue;
    await s.categorias.create(await validar(CreateCategoriaEquipamentoDto, { nome }, `categoria ${nome}`));
  }

  // O modelo não tem rota de editar: o texto corrompido se corrige direto
  for (const modelo of await prisma.tipos_equipamentos.findMany()) {
    const nome = semMojibake(modelo.nome);
    const fabricante = modelo.fabricante ? semMojibake(modelo.fabricante) : modelo.fabricante;
    if (nome === modelo.nome && fabricante === modelo.fabricante) continue;
    await prisma.tipos_equipamentos.update({ where: { id: modelo.id }, data: { nome, fabricante } });
    corrigidas++;
  }

  const categorias = await prisma.categorias_equipamentos.findMany();
  for (const categoria of categorias) c.categorias.set(categoria.nome, categoria.id.trim());

  for (const novo of MODELOS_NOVOS) {
    if (await prisma.tipos_equipamentos.findFirst({ where: { codigo: novo.codigo } })) continue;
    const categoriaId = c.categorias.get(novo.categoria);
    if (!categoriaId) throw new Error(`Categoria do modelo ${novo.codigo} não existe: ${novo.categoria}`);
    await s.modelos.create(
      await validar(CreateTipoEquipamentoDto, { codigo: novo.codigo, nome: novo.nome, fabricante: novo.fabricante, categoriaId }, `modelo ${novo.codigo}`),
    );
  }

  const nomeDaCategoria = new Map(categorias.map((cat) => [cat.id.trim(), cat.nome]));
  for (const modelo of await prisma.tipos_equipamentos.findMany()) {
    c.modelos.set(modelo.codigo, {
      id: modelo.id.trim(),
      categoria: nomeDaCategoria.get(modelo.categoria_id?.trim() ?? '') ?? '',
      fabricante: modelo.fabricante ?? '',
      nome: modelo.nome,
    });
  }

  // Os usuários que ficam também tinham nome corrompido ("Usu├írio"); são poucos, e o par pode não ser o do "├"
  const usuarios = (await prisma.usuarios.findMany({ select: { id: true, nome: true } })).filter((u) => semMojibake(u.nome) !== u.nome);
  for (const usuario of usuarios) await prisma.usuarios.update({ where: { id: usuario.id }, data: { nome: semMojibake(usuario.nome) } });

  c.log(`  catálogo: ${corrigidas} textos corrigidos, ${c.categorias.size} categorias, ${c.modelos.size} modelos; ${usuarios.length} nomes de usuário corrigidos`);
}

/** Uma pessoa por papel do PCM, pelo service de usuários (senha provisória; o e-mail não sai) */
export async function criarPessoas(c: Cenario, senha: string | null): Promise<void> {
  const papeis = await c.prisma.roles.findMany({ select: { id: true, name: true } });
  for (const [i, p] of PESSOAS.entries()) {
    const papel = papeis.find((r) => r.name === p.papel);
    if (!papel) throw new Error(`Papel ${p.papel} não existe no banco`);
    const dto = await validar(
      CreateUsuarioDto,
      { nome: p.nome, email: emailDe(p, DOMINIO_DO_SEED), status: 'Ativo', cidade: p.cidade, estado: 'GO', roleId: Number(papel.id) },
      `usuário ${p.nome}`,
    );
    const criado = await c.relogio.em(as(somarDias(c.inicio, -75 + i), '09:00'), () => c.s.usuarios.create(dto));
    const id = criado.id.trim();
    if (senha) {
      await c.s.usuarios.resetPassword(id, await validar(ResetPasswordDto, { novaSenha: senha, confirmarSenha: senha }, `senha de ${p.nome}`));
    }
    c.pessoas.set(p.chave, { id, nome: p.nome, papel: p.papel, usuario: { id, role: p.papel } });
  }
  c.log(`  pessoas: ${c.pessoas.size} (${senha ? 'senha do SEED_SENHA' : 'senha provisória aleatória; rode --senhas com SEED_SENHA para entrar com elas'})`);
}

export async function criarPlantas(c: Cenario): Promise<void> {
  const concessionaria = await c.prisma.concessionarias_energia.findFirst({ select: { id: true } });
  for (const [i, dados] of PLANTAS.entries()) {
    const quando = as(somarDias(c.inicio, -70 + i), '10:00');
    const criada = await c.relogio.em(quando, async () =>
      c.s.plantas.create(
        await validar(
          CreatePlantaDto,
          {
            nome: dados.nome,
            cnpj: dados.cnpj,
            proprietarioId: pessoa(c, dados.dono).id,
            horarioFuncionamento: dados.horario,
            localizacao: dados.localizacao,
            endereco: dados.endereco,
          },
          `planta ${dados.nome}`,
        ),
      ),
    );
    const planta: Planta = { id: criada.id.trim(), chave: dados.chave, nome: dados.nome, dados, unidades: new Map() };
    c.plantas.set(dados.chave, planta);

    for (const [j, u] of dados.unidades.entries()) {
      const media = u.tensao.includes('34,5') ? 'A3a_VERDE' : u.tensao.includes('13,8') ? 'A4_VERDE' : 'B';
      const unidade = await c.relogio.em(as(somarDias(c.inicio, -70 + i), `1${j}:30`), async () =>
        c.s.unidades.create(
          await validar(
            CreateUnidadeDto,
            {
              planta_id: planta.id,
              nome: u.nome,
              numero_uc: u.numeroUc,
              tipo: u.tipo,
              estado: dados.endereco.uf,
              cidade: dados.endereco.cidade,
              latitude: dados.coordenadas[0] + j * 0.001,
              longitude: dados.coordenadas[1] + j * 0.001,
              potencia: u.potenciaKw,
              status: 'ativo',
              grupo: media === 'B' ? 'B' : 'A',
              subgrupo: media,
              tipo_unidade: u.tipoEnergia,
              ...(u.tipoEnergia === 'Geração' ? { demanda_geracao: u.demandaKw } : { demanda_carga: u.demandaKw }),
              ...(u.tipoEnergia === 'Carga e Geração' && { demanda_geracao: 800 }),
              ...(concessionaria && { concessionaria_id: concessionaria.id.trim() }),
              tensao_nominal: u.tensao,
              industrial: dados.chave === 'laticinio',
              geracao: u.tipoEnergia !== 'Carga',
            },
            `instalação ${u.nome}`,
          ),
        ),
      );
      planta.unidades.set(u.nome, { id: unidade.id.trim(), nome: u.nome, dados: u });
    }

    // A equipe da planta: quem escala é a administradora, como na tela
    const admin = pessoa(c, 'patricia');
    for (const tecnico of dados.tecnicos) {
      await c.relogio.em(as(somarDias(c.inicio, -70 + i), '16:00'), () => c.s.operadores.add(planta.id, pessoa(c, tecnico).id, admin.usuario));
    }
  }
  c.log(`  plantas: ${c.plantas.size}, instalações: ${[...c.plantas.values()].reduce((n, p) => n + p.unidades.size, 0)}`);
}

export async function criarAgenda(c: Cenario): Promise<void> {
  const plantaIds = (chaves?: string[]) => chaves?.map((k) => c.plantas.get(k)!.id);
  for (const regra of DIAS_UTEIS) {
    const dto = await validar(
      CreateConfiguracaoDiasUteisDto,
      { nome: regra.nome, descricao: regra.descricao, ...regra.dias, geral: !regra.plantas, ...(regra.plantas && { plantaIds: plantaIds(regra.plantas) }) },
      `dias úteis ${regra.nome}`,
    );
    await c.relogio.em(as(somarDias(c.inicio, -60), '09:00'), () => c.s.diasUteis.criar(dto));
  }
  for (const feriado of FERIADOS) {
    const dto = await validar(
      CreateFeriadoDto,
      {
        nome: feriado.nome,
        data: feriado.data,
        tipo: feriado.tipo,
        recorrente: feriado.recorrente,
        geral: !feriado.plantas,
        ...(feriado.plantas && { plantaIds: plantaIds(feriado.plantas) }),
      },
      `feriado ${feriado.nome}`,
    );
    await c.relogio.em(as(somarDias(c.inicio, -60), '09:30'), () => c.s.feriados.criar(dto));
  }
  c.log(`  agenda: ${DIAS_UTEIS.length} regras de dias úteis, ${FERIADOS.length} feriados`);
}

export async function criarFrota(c: Cenario): Promise<void> {
  const marcos = pessoa(c, 'marcos');
  for (const v of VEICULOS) {
    const dto = await validar(
      CreateVeiculoDto,
      {
        nome: v.nome,
        codigoPatrimonial: `PAT-${v.placa}`,
        placa: v.placa,
        marca: v.marca,
        modelo: v.modelo,
        anoFabricacao: v.ano,
        anoModelo: v.ano,
        cor: v.cor,
        renavam: v.renavam,
        tipo: v.tipo,
        tipoCombustivel: v.combustivel,
        capacidadePassageiros: v.passageiros,
        capacidadeCarga: v.cargaKg,
        autonomiaMedia: v.autonomia,
        localizacaoAtual: 'Base da manutenção em Goiânia',
        valorAquisicao: v.valor,
        dataAquisicao: `${v.ano}-02-01`,
        responsavel: marcos.nome,
        responsavelId: marcos.id,
        quilometragem: v.km,
        seguradora: 'Seguradora do Cerrado',
        vencimentoSeguro: diaDe(somarDias(c.agora, 120)),
        ultimaRevisao: diaDe(somarDias(c.agora, -45)),
        proximaRevisao: diaDe(somarDias(c.agora, 60)),
      },
      `viatura ${v.nome}`,
    );
    const criado = await c.relogio.em(as(somarDias(c.inicio, -55), '11:00'), () => c.s.veiculos.criar(dto));
    c.veiculos.set(v.chave, { id: criado.id.trim(), nome: v.nome, km: v.km });

    const documentos = [
      { tipo: 'licenciamento', descricao: `Licenciamento ${c.agora.getFullYear()}`, vence: v.documentoVence ?? 150, numero: `CRLV-${v.placa}` },
      { tipo: 'seguro', descricao: 'Apólice de seguro da frota', vence: 120, numero: `APL-${v.placa}` },
    ];
    for (const doc of documentos) {
      const docDto = await validar(
        CreateDocumentacaoVeiculoDto,
        { tipo: doc.tipo, descricao: doc.descricao, dataVencimento: diaDe(somarDias(c.agora, doc.vence)), numeroDocumento: doc.numero, orgaoEmissor: doc.tipo === 'seguro' ? 'Seguradora do Cerrado' : 'DETRAN-GO' },
        `documento ${doc.descricao}`,
      );
      await c.relogio.em(as(somarDias(c.inicio, -55), '11:30'), () => c.s.documentos.criarDocumentacao(criado.id.trim(), docDto));
    }
  }
  c.log(`  frota: ${c.veiculos.size} viaturas com documentos`);
}
