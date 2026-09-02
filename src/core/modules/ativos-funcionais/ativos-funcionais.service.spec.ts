import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AtivosFuncionaisService } from './ativos-funcionais.service';

/**
 * As regras do vinculo entre POSICAO e EQUIPAMENTO, contra Postgres de verdade.
 *
 * Nao usa mock de proposito. O que estas regras precisam provar e comportamento
 * do banco — o indice unico parcial que impede dois equipamentos ativos na mesma
 * posicao, e a transacao que fecha um vinculo e abre outro sem deixar estado
 * intermediario. Um mock devolveria o que mandassemos devolver e nao provaria
 * nenhum dos dois.
 */
describe('AtivosFuncionaisService (banco real)', () => {
  const prisma = new PrismaClient();
  const service = new AtivosFuncionaisService(prisma as any);

  let categoriaId: string;
  let unidadeId: string;
  let posicaoA: string;
  let posicaoB: string;
  let motorA: string;
  let motorB: string;

  const criarEquipamento = async (nome: string) => {
    const eq = await prisma.equipamentos.create({
      data: { nome, classificacao: 'UC', criticidade: '3', unidade_id: unidadeId },
    });
    return eq.id.trim();
  };

  // Ids fixos e `upsert`: o banco de teste nao e recriado a cada execucao, e
  // fixture que so funciona na primeira rodada da erro de email duplicado na
  // segunda — parecendo falha de codigo quando e sujeira de teste.
  const ID_PROPRIETARIO = "TESTEPROPRIETARIO000000001";
  const ID_PLANTA = "TESTEPLANTA00000000000001";
  const ID_UNIDADE = "TESTEUNIDADE0000000000001";
  const ID_CATEGORIA = "TESTECATEGORIA0000000001";

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: ID_PROPRIETARIO },
      update: {},
      create: {
        id: ID_PROPRIETARIO,
        nome: "Proprietario de teste",
        email: "proprietario.teste@exemplo.local",
      },
    });
    await prisma.plantas.upsert({
      where: { id: ID_PLANTA },
      update: {},
      create: {
        id: ID_PLANTA,
        nome: "Planta de teste",
        proprietario_id: ID_PROPRIETARIO,
        cnpj: "00000000000191",
        localizacao: "Teste",
        horario_funcionamento: "08:00-18:00",
        logradouro: "Rua de teste, 1",
        cidade: "Goiania",
        uf: "GO",
        cep: "74000000",
      },
    });
    await prisma.unidades.upsert({
      where: { id: ID_UNIDADE },
      update: {},
      create: {
        id: ID_UNIDADE,
        planta_id: ID_PLANTA,
        nome: "Instalacao de teste",
        tipo: "Carga",
        estado: "GO",
        cidade: "Goiania",
        latitude: 0,
        longitude: 0,
        potencia: 0,
      },
    });
    await prisma.categorias_equipamentos.upsert({
      where: { id: ID_CATEGORIA },
      update: {},
      create: { id: ID_CATEGORIA, nome: "Motor Eletrico (teste)" },
    });

    unidadeId = ID_UNIDADE;
    categoriaId = ID_CATEGORIA;
  });
  beforeEach(async () => {
    await prisma.ativos_funcionais_equipamentos.deleteMany({});
    await prisma.equipamentos.deleteMany({ where: { unidade_id: ID_UNIDADE } });
    await prisma.ativos_funcionais.deleteMany({});

    const a = await service.criar({
      nome: 'Inversor 1', categoria_id: categoriaId, unidade_id: unidadeId,
    });
    const b = await service.criar({
      nome: 'Inversor 2', categoria_id: categoriaId, unidade_id: unidadeId,
    });
    posicaoA = a.id.trim();
    posicaoB = b.id.trim();

    motorA = await criarEquipamento('Motor A');
    motorB = await criarEquipamento('Motor B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('instalar', () => {
    it('abre um vinculo e marca o equipamento como ativo na posicao', async () => {
      await service.instalar(posicaoA, motorA);

      const vinculos = await service.historico(posicaoA);
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0].equipamento_id.trim()).toBe(motorA);
      expect(vinculos[0].removido_em).toBeNull();

      const eq = await prisma.equipamentos.findUnique({ where: { id: motorA } });
      expect(eq?.ativo_funcional_id?.trim()).toBe(posicaoA);
      expect(eq?.ativo_na_posicao).toBe(true);
    });

    it('recusa um segundo equipamento na posicao ja ocupada', async () => {
      await service.instalar(posicaoA, motorA);
      await expect(service.instalar(posicaoA, motorB)).rejects.toBeInstanceOf(ConflictException);

      // e nao deixa rastro do que foi recusado
      const vinculos = await service.historico(posicaoA);
      expect(vinculos).toHaveLength(1);
    });

    it('recusa posicao inexistente', async () => {
      await expect(
        service.instalar('NAOEXISTE0000000000000001', motorA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remover', () => {
    it('fecha o vinculo e libera a posicao', async () => {
      await service.instalar(posicaoA, motorA);
      await service.remover(posicaoA, { motivo: 'Queimou' });

      const vinculos = await service.historico(posicaoA);
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0].removido_em).not.toBeNull();
      expect(vinculos[0].motivo_remocao).toBe('Queimou');

      const eq = await prisma.equipamentos.findUnique({ where: { id: motorA } });
      expect(eq?.ativo_na_posicao).toBe(false);

      // liberada: aceita outro equipamento
      await expect(service.instalar(posicaoA, motorB)).resolves.toBeDefined();
    });
  });

  describe('transferir', () => {
    it('fecha o vinculo de origem e abre o de destino, preservando o historico', async () => {
      await service.instalar(posicaoA, motorA);
      await service.transferir(motorA, posicaoB, { motivo: 'Remanejado' });

      const daOrigem = await service.historico(posicaoA);
      expect(daOrigem).toHaveLength(1);
      expect(daOrigem[0].removido_em).not.toBeNull();

      const doDestino = await service.historico(posicaoB);
      expect(doDestino).toHaveLength(1);
      expect(doDestino[0].removido_em).toBeNull();

      const eq = await prisma.equipamentos.findUnique({ where: { id: motorA } });
      expect(eq?.ativo_funcional_id?.trim()).toBe(posicaoB);
    });

    it('recusa transferir para posicao ja ocupada, sem desfazer a origem', async () => {
      await service.instalar(posicaoA, motorA);
      await service.instalar(posicaoB, motorB);

      await expect(
        service.transferir(motorA, posicaoB, { motivo: 'Remanejado' }),
      ).rejects.toBeInstanceOf(ConflictException);

      // a origem tem de continuar intacta — transacao revertida por inteiro
      const daOrigem = await service.historico(posicaoA);
      expect(daOrigem).toHaveLength(1);
      expect(daOrigem[0].removido_em).toBeNull();
    });

    it('um equipamento que sai e volta aparece duas vezes no historico', async () => {
      await service.instalar(posicaoA, motorA);
      await service.transferir(motorA, posicaoB, { motivo: 'Emprestado' });
      await service.transferir(motorA, posicaoA, { motivo: 'Devolvido' });

      const daOrigem = await service.historico(posicaoA);
      expect(daOrigem).toHaveLength(2);
      expect(daOrigem.filter(v => v.removido_em === null)).toHaveLength(1);
    });
  });

  describe('historico', () => {
    it('lista do mais recente para o mais antigo', async () => {
      await service.instalar(posicaoA, motorA);
      await service.remover(posicaoA, { motivo: 'Queimou' });
      await service.instalar(posicaoA, motorB);

      const vinculos = await service.historico(posicaoA);
      expect(vinculos.map(v => v.equipamento_id.trim())).toEqual([motorB, motorA]);
    });
  });
  describe("listar", () => {
    it("marca quais posicoes ja tem equipamento ativo", async () => {
      await service.instalar(posicaoA, motorA);

      const lista = await service.listar({ unidade_id: unidadeId });
      const porId = new Map(lista.map(p => [p.id.trim(), p]));

      // E o que faz o aviso de "posicao ocupada" aparecer ANTES de salvar,
      // e nao como erro depois do submit.
      expect(porId.get(posicaoA)?.ocupada).toBe(true);
      expect(porId.get(posicaoA)?.equipamento_ativo?.id.trim()).toBe(motorA);
      expect(porId.get(posicaoB)?.ocupada).toBe(false);
      expect(porId.get(posicaoB)?.equipamento_ativo).toBeNull();
    });

    it("nao lista posicoes de outra instalacao", async () => {
      const lista = await service.listar({ unidade_id: "OUTRAUNIDADE000000000001" });
      expect(lista).toHaveLength(0);
    });

    it("ignora posicoes removidas", async () => {
      await prisma.ativos_funcionais.update({
        where: { id: posicaoB },
        data: { deleted_at: new Date() },
      });
      const lista = await service.listar({ unidade_id: unidadeId });
      expect(lista.map(p => p.id.trim())).toEqual([posicaoA]);
    });
  });

  describe("buscarPorId", () => {
    it("traz o equipamento ativo e os anteriores separados", async () => {
      await service.instalar(posicaoA, motorA);
      await service.remover(posicaoA, { motivo: "Queimou" });
      await service.instalar(posicaoA, motorB);

      const posicao = await service.buscarPorId(posicaoA);

      expect(posicao.equipamento_ativo?.id.trim()).toBe(motorB);
      expect(posicao.anteriores).toHaveLength(1);
      expect(posicao.anteriores[0].equipamento_id.trim()).toBe(motorA);
      expect(posicao.anteriores[0].motivo_remocao).toBe("Queimou");
    });

    it("posicao vazia devolve equipamento ativo nulo, nao erro", async () => {
      const posicao = await service.buscarPorId(posicaoB);
      expect(posicao.equipamento_ativo).toBeNull();
      expect(posicao.anteriores).toHaveLength(0);
    });

    it("recusa posicao inexistente", async () => {
      await expect(
        service.buscarPorId("NAOEXISTE0000000000000001"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
