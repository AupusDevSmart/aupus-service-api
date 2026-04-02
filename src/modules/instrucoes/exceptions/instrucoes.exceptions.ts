// src/modules/instrucoes/exceptions/instrucoes.exceptions.ts
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

export class InstrucaoNaoEncontradaException extends NotFoundException {
  constructor(id?: string) {
    super(
      id
        ? `Instrução com ID "${id}" não encontrada`
        : 'Instrução não encontrada'
    );
  }
}

export class TagInstrucaoJaExisteException extends ConflictException {
  constructor(tag: string) {
    super(`A TAG "${tag}" já está sendo utilizada por outra instrução`);
  }
}

export class ArquivoInvalidoException extends BadRequestException {
  constructor(motivo: string) {
    super(`Arquivo inválido: ${motivo}`);
  }
}
