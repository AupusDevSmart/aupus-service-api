// src/modules/instrucoes/exceptions/instrucoes.exceptions.ts
import { NotFoundException, BadRequestException } from '@nestjs/common';

export class InstrucaoNaoEncontradaException extends NotFoundException {
  constructor(id?: string) {
    super(
      id
        ? `Instrução com ID "${id}" não encontrada`
        : 'Instrução não encontrada'
    );
  }
}

export class ArquivoInvalidoException extends BadRequestException {
  constructor(motivo: string) {
    super(`Arquivo inválido: ${motivo}`);
  }
}
