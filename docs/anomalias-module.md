# Módulo de Anomalias - Documentação API

## Visão Geral

O módulo de anomalias é responsável por gerenciar o registro, acompanhamento e resolução de anomalias identificadas em plantas industriais. Inclui funcionalidades completas de CRUD, gestão de status, upload de arquivos e geração de relatórios.

## Estrutura do Módulo

```
src/modules/anomalias/
├── dto/                           # Data Transfer Objects
│   ├── create-anomalia.dto.ts     # DTO para criação de anomalias
│   ├── update-anomalia.dto.ts     # DTO para atualização de anomalias
│   ├── anomalia-response.dto.ts   # DTO de resposta das anomalias
│   ├── anomalia-filters.dto.ts    # DTO para filtros de busca
│   ├── anomalia-stats.dto.ts      # DTO para estatísticas
│   ├── anexo-anomalia.dto.ts      # DTOs para anexos
│   └── index.ts                   # Exportações centralizadas
├── anomalias.controller.ts        # Controlador principal
├── anomalias.service.ts          # Serviço principal
├── anexos-anomalias.service.ts   # Serviço de anexos
└── anomalias.module.ts           # Módulo NestJS
```

## Endpoints da API

### 1. Gerenciamento de Anomalias

#### `POST /anomalias`
**Descrição:** Criar nova anomalia  
**Body:**
```json
{
  "descricao": "Vazamento de óleo no mancal do motor principal",
  "localizacao": {
    "plantaId": "uuid",
    "equipamentoId": "uuid", 
    "local": "Sala de compressores",
    "ativo": "Compressor 01"
  },
  "condicao": "FUNCIONANDO",
  "origem": "OPERADOR",
  "prioridade": "MEDIA",
  "observacoes": "Observado durante inspeção de rotina"
}
```
**Response:** `AnomaliaResponseDto`

#### `GET /anomalias`
**Descrição:** Listar anomalias com filtros e paginação  
**Query Parameters:**
- `search`: Busca por descrição ou local
- `periodo`: Filtro por período 
- `status`: Filtro por status
- `prioridade`: Filtro por prioridade
- `origem`: Filtro por origem
- `planta`: Filtro por planta
- `page`: Página (padrão: 1)
- `limit`: Itens por página (padrão: 10)

**Response:**
```json
{
  "data": [AnomaliaResponseDto],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  }
}
```

#### `GET /anomalias/stats`
**Descrição:** Obter estatísticas das anomalias  
**Query Parameters:**
- `periodo`: Período para filtrar (opcional)

**Response:** `AnomaliaStatsDto`

#### `GET /anomalias/:id`
**Descrição:** Buscar anomalia específica por ID  
**Response:** `AnomaliaResponseDto`

#### `PATCH /anomalias/:id`
**Descrição:** Atualizar anomalia  
**Body:** `UpdateAnomaliaDto` (campos opcionais)  
**Response:** `AnomaliaResponseDto`

#### `DELETE /anomalias/:id`
**Descrição:** Remover anomalia (soft delete)  
**Response:** Confirmação de remoção

### 2. Fluxo de Status

#### `POST /anomalias/:id/gerar-os`
**Descrição:** Gerar Ordem de Serviço para anomalia  
**Response:** `AnomaliaResponseDto` (status atualizado para OS_GERADA)

#### `POST /anomalias/:id/resolver`
**Descrição:** Resolver anomalia  
**Body:**
```json
{
  "observacoes": "Problema resolvido com troca do vedador"
}
```
**Response:** `AnomaliaResponseDto` (status atualizado para RESOLVIDA)

#### `POST /anomalias/:id/cancelar`
**Descrição:** Cancelar anomalia  
**Body:**
```json
{
  "motivo": "Falso positivo identificado"
}
```
**Response:** `AnomaliaResponseDto` (status atualizado para CANCELADA)

### 3. Endpoints de Apoio (Selects)

#### `GET /anomalias/selects/plantas`
**Descrição:** Listar plantas disponíveis para seleção  
**Response:**
```json
[
  {
    "id": "uuid",
    "nome": "Planta Norte"
  }
]
```

#### `GET /anomalias/selects/equipamentos`
**Descrição:** Listar equipamentos disponíveis  
**Query Parameters:**
- `plantaId`: Filtrar por planta específica (opcional)

**Response:**
```json
[
  {
    "id": "uuid",
    "nome": "Compressor 01",
    "planta_id": "uuid",
    "planta_nome": "Planta Norte"
  }
]
```

#### `GET /anomalias/selects/usuarios`
**Descrição:** Listar usuários disponíveis  
**Response:**
```json
[
  {
    "id": "uuid",
    "nome": "João Silva",
    "email": "joao@empresa.com"
  }
]
```

## Sistema de Upload de Arquivos

### Arquitetura de Anexos

O sistema de anexos foi projetado para ser reutilizável em outros módulos da aplicação. A implementação atual utiliza armazenamento local, mas está preparada para migração para S3.

#### Estrutura de Dados
```typescript
interface AnexoAnomaliaResponseDto {
  id: string;
  nome: string;                    // Nome gerado único
  nome_original: string;           // Nome original do arquivo
  tipo: string;                    // Extensão do arquivo
  mime_type: string;              // MIME type
  tamanho: number;                // Tamanho em bytes
  descricao?: string;             // Descrição opcional
  caminho_s3: string;             // Caminho do arquivo (local ou S3)
  url_download?: string;          // URL para download
  anomalia_id: string;            // ID da anomalia
  usuario_id?: string;            // ID do usuário que fez upload
  usuario?: {                     // Dados do usuário
    id: string;
    nome: string;
    email: string;
  };
  created_at: Date;
  updated_at: Date;
}
```

### Endpoints de Anexos

#### `POST /anomalias/:id/anexos`
**Descrição:** Upload de anexo para anomalia  
**Content-Type:** `multipart/form-data`  
**Body:**
- `file`: Arquivo (obrigatório)
- `descricao`: Descrição opcional (string)

**Validações:**
- **Tipos permitidos:** png, pdf, jpg, jpeg, doc, docx, xls, xlsx
- **Tamanho máximo:** 10MB
- **Arquivo obrigatório**

**Response:** `AnexoAnomaliaResponseDto`

#### `GET /anomalias/:id/anexos`
**Descrição:** Listar anexos de uma anomalia  
**Response:** `AnexoAnomaliaResponseDto[]`

#### `GET /anomalias/anexos/:anexoId`
**Descrição:** Buscar informações de anexo específico  
**Response:** `AnexoAnomaliaResponseDto`

#### `GET /anomalias/anexos/:anexoId/download`
**Descrição:** Download de anexo  
**Response:** Stream do arquivo com headers apropriados
- `Content-Type`: MIME type do arquivo
- `Content-Disposition`: attachment com nome original
- `Content-Length`: Tamanho do arquivo

#### `DELETE /anomalias/anexos/:anexoId`
**Descrição:** Remover anexo  
**Response:** Confirmação de remoção

### Implementação Técnica do Upload

#### 1. Fluxo de Upload
```typescript
async uploadAnexo(anomaliaId, file, descricao?, usuarioId?) {
  // 1. Verificar se anomalia existe
  await this.verificarAnomaliaExiste(anomaliaId);
  
  // 2. Validar arquivo (tipo, tamanho)
  this.validarArquivo(file);
  
  // 3. Gerar nome único
  const nomeArquivo = this.gerarNomeUnico(file.originalname);
  
  // 4. Salvar arquivo localmente
  const caminhoLocal = await this.salvarArquivoLocal(file, nomeArquivo);
  
  // 5. Salvar metadados no banco
  return await this.salvarMetadados(anexoData);
}
```

#### 2. Validações Implementadas
```typescript
private readonly TIPOS_PERMITIDOS = ['png', 'pdf', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'];
private readonly TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB

private validarArquivo(file: any): void {
  // Verificar se arquivo foi enviado
  if (!file) {
    throw new BadRequestException('Arquivo é obrigatório');
  }
  
  // Validar extensão
  const extensao = this.extrairExtensao(file.originalname);
  if (!this.TIPOS_PERMITIDOS.includes(extensao)) {
    throw new BadRequestException(`Tipo não permitido: ${this.TIPOS_PERMITIDOS.join(', ')}`);
  }
  
  // Validar tamanho
  if (file.size > this.TAMANHO_MAXIMO) {
    throw new BadRequestException(`Tamanho máximo: 10MB`);
  }
}
```

#### 3. Geração de Nome Único
```typescript
private gerarNomeUnico(nomeOriginal: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const extensao = path.extname(nomeOriginal);
  const nomeBase = path.basename(nomeOriginal, extensao);
  
  return `${nomeBase}_${timestamp}_${random}${extensao}`;
}
```

#### 4. Armazenamento Local
```typescript
private async salvarArquivoLocal(file: any, nomeArquivo: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'uploads', 'anexos');
  
  // Criar diretório se não existir
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  const caminhoCompleto = path.join(uploadDir, nomeArquivo);
  fs.writeFileSync(caminhoCompleto, file.buffer);
  
  return caminhoCompleto;
}
```

## Reutilização em Outros Módulos

### 1. Padrão de Implementação

Para implementar upload de arquivos em outros módulos, siga este padrão:

#### Estrutura de Serviço
```typescript
@Injectable()
export class AnexosModuloService {
  constructor(private readonly prisma: PrismaService) {}
  
  private readonly TIPOS_PERMITIDOS = ['png', 'pdf', 'jpg', 'jpeg', 'doc', 'docx'];
  private readonly TAMANHO_MAXIMO = 10 * 1024 * 1024; // Ajustar conforme necessário
  
  async uploadAnexo(entidadeId: string, file: any, descricao?: string) {
    // Implementação similar ao AnexosAnomaliasService
  }
  
  // ... outros métodos
}
```

#### Controller Pattern
```typescript
@Post(':id/anexos')
@UseInterceptors(FileInterceptor('file'))
@ApiOperation({ summary: 'Upload de anexo' })
@ApiConsumes('multipart/form-data')
async uploadAnexo(
  @Param('id') entidadeId: string,
  @UploadedFile() file: any,
  @Body() uploadDto: UploadAnexoDto
) {
  return this.anexosService.uploadAnexo(entidadeId, file, uploadDto.descricao);
}
```

### 2. Configurações Personalizáveis

Para cada módulo, você pode customizar:

```typescript
// Tipos de arquivo permitidos por contexto
const TIPOS_DOCUMENTOS = ['pdf', 'doc', 'docx'];
const TIPOS_IMAGENS = ['png', 'jpg', 'jpeg'];
const TIPOS_PLANILHAS = ['xls', 'xlsx', 'csv'];

// Tamanhos máximos por tipo
const TAMANHO_IMAGEM = 5 * 1024 * 1024;    // 5MB para imagens
const TAMANHO_DOCUMENTO = 20 * 1024 * 1024; // 20MB para documentos

// Diretórios por módulo
const UPLOAD_DIRS = {
  anomalias: 'uploads/anexos',
  relatorios: 'uploads/relatorios',
  usuarios: 'uploads/perfil'
};
```

### 3. Migration para S3 (Futuro)

A estrutura atual está preparada para migração para Amazon S3:

```typescript
// Substituir salvarArquivoLocal por:
private async salvarArquivoS3(file: any, nomeArquivo: string): Promise<string> {
  const uploadParams = {
    Bucket: process.env.S3_BUCKET,
    Key: `anexos/${nomeArquivo}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  
  const result = await this.s3.upload(uploadParams).promise();
  return result.Location;
}
```

## Status de Anomalias

```typescript
enum StatusAnomalia {
  AGUARDANDO = 'AGUARDANDO',    // Status inicial
  EM_ANALISE = 'EM_ANALISE',    // Em análise técnica
  OS_GERADA = 'OS_GERADA',      // OS gerada para correção
  CANCELADA = 'CANCELADA',       // Anomalia cancelada
  RESOLVIDA = 'RESOLVIDA'        // Problema resolvido
}
```

## Enums e Constantes

```typescript
enum PrioridadeAnomalia {
  BAIXA = 'BAIXA',
  MEDIA = 'MEDIA', 
  ALTA = 'ALTA',
  CRITICA = 'CRITICA'
}

enum CondicaoAnomalia {
  PARADO = 'PARADO',
  FUNCIONANDO = 'FUNCIONANDO',
  RISCO_ACIDENTE = 'RISCO_ACIDENTE'
}

enum OrigemAnomalia {
  SCADA = 'SCADA',      // Sistema SCADA
  OPERADOR = 'OPERADOR', // Identificado por operador
  FALHA = 'FALHA'        // Falha de sistema
}
```

## Considerações de Segurança

1. **Validação de Arquivo:** Sempre validar tipo e tamanho
2. **Nome Único:** Gerar nomes únicos para evitar conflitos
3. **Sanitização:** Limpar nomes de arquivo de caracteres perigosos
4. **Diretório Seguro:** Armazenar fora do diretório web público
5. **Controle de Acesso:** Implementar autorização para download

## Monitoramento e Logs

- Upload de arquivos gera logs automáticos
- Histórico de mudanças de status é mantido
- Métricas de uso podem ser extraídas das tabelas

## Próximos Passos

1. **Migração S3:** Implementar armazenamento em nuvem
2. **Processamento de Imagens:** Gerar thumbnails automáticos
3. **Antivírus:** Integração com scanner de malware
4. **Compressão:** Otimizar arquivos grandes automaticamente
5. **CDN:** Implementar distribuição de conteúdo para downloads