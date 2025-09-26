// src/modules/planos-manutencao/exceptions/planos-manutencao.exceptions.ts
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

export class PlanoJaExisteException extends ConflictException {
  constructor(equipamentoNome?: string) {
    super(
      equipamentoNome 
        ? `O equipamento "${equipamentoNome}" já possui um plano de manutenção`
        : 'Este equipamento já possui um plano de manutenção'
    );
  }
}

export class PlanoNaoEncontradoException extends NotFoundException {
  constructor(id?: string) {
    super(
      id 
        ? `Plano de manutenção com ID "${id}" não encontrado`
        : 'Plano de manutenção não encontrado'
    );
  }
}

export class EquipamentoNaoEncontradoException extends NotFoundException {
  constructor(id?: string) {
    super(
      id 
        ? `Equipamento com ID "${id}" não encontrado`
        : 'Equipamento não encontrado'
    );
  }
}

export class DuplicacaoInvalidaException extends BadRequestException {
  constructor(motivo: string) {
    super(`Não é possível duplicar o plano: ${motivo}`);
  }
}