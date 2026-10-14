import { PartialType, PickType } from '@nestjs/swagger';
import { CreateUsuarioDto } from './create-usuario.dto';

/**
 * O que o próprio usuário edita na tela "Meu perfil" (PATCH /usuarios/me).
 * Fora de propósito: tipo, permissões, status e vínculos — esses são da
 * gestão de usuários, com a hierarquia de papéis.
 */
export class AtualizarPerfilDto extends PartialType(
  PickType(CreateUsuarioDto, [
    'nome',
    'email',
    'telefone',
    'instagram',
    'cpfCnpj',
    'cidade',
    'estado',
    'endereco',
    'cep',
  ] as const),
) {}
