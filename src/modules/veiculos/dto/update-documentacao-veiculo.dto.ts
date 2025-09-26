import { PartialType } from '@nestjs/swagger';
import { CreateDocumentacaoVeiculoDto } from './create-documentacao-veiculo.dto';

export class UpdateDocumentacaoVeiculoDto extends PartialType(CreateDocumentacaoVeiculoDto) {
  // Herda todos os campos opcionais do CreateDocumentacaoVeiculoDto
}