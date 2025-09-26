# 🔧 AUPUS Service API

API REST para o sistema AUPUS - Sistema de Gestão de Manutenção Industrial.

## 🚀 Tecnologias

- **Framework:** NestJS
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Containerização:** Docker
- **Documentação:** Swagger/OpenAPI

## 📋 Pré-requisitos

- Node.js 20+
- npm ou yarn
- Docker (para containerização)
- PostgreSQL (ou usar Docker)

## 🏃‍♂️ Como executar

### Desenvolvimento local

```bash
# Instalar dependências
npm install

# Configurar banco de dados
# Editar .env com suas configurações

# Gerar cliente Prisma
npx prisma generate

# Executar migrações
npx prisma migrate dev

# Iniciar em modo desenvolvimento
npm run start:dev
```

### Com Docker

```bash
# Desenvolvimento (apenas banco local)
npm run docker:dev
npm run start:dev

# Produção completa
npm run docker:prod

# Produção com banco remoto
npm run docker:remote
```

## 📊 Endpoints principais

- **Swagger UI:** `http://localhost:3000/api`
- **Health Check:** `http://localhost:3000/api/v1/health`
- **Programação OS:** `http://localhost:3000/api/v1/programacao-os`

## 🏗️ Estrutura do projeto

```
src/
├── modules/           # Módulos da aplicação
│   ├── programacao-os/   # Gestão de programações
│   ├── usuarios/         # Gestão de usuários
│   └── ...
├── shared/            # Recursos compartilhados
│   ├── pipes/           # Pipes customizados
│   ├── prisma/          # Configuração Prisma
│   └── ...
└── main.ts           # Ponto de entrada
```

## 🐳 Deploy

Ver documentação completa em [DEPLOY.md](./DEPLOY.md)

```bash
# Deploy em produção
npm run docker:production
```

## 📝 Scripts disponíveis

```bash
# Desenvolvimento
npm run start:dev        # Modo desenvolvimento
npm run build           # Build para produção
npm run start:prod       # Executar produção

# Docker
npm run docker:dev       # Banco local no Docker
npm run docker:remote    # App no Docker + banco remoto
npm run docker:production # Deploy produção

# Testes
npm run test            # Executar testes
npm run test:watch      # Testes em modo watch

# Banco de dados
npm run db:seed         # Executar seed do banco
```

## 🔒 Variáveis de ambiente

Copie `.env.example` para `.env` e configure:

```bash
DATABASE_URL="postgresql://user:password@host:5432/database"
JWT_SECRET="your-jwt-secret"
NODE_ENV="development"
PORT=3000
```

## 📚 Documentação

- **API:** Acesse `/api` para Swagger
- **Deploy:** [DEPLOY.md](./DEPLOY.md)
- **Docker:** [DOCKER.md](./DOCKER.md)

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob licença privada.