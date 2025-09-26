# Use a imagem oficial do Node.js LTS como base
FROM node:20-alpine AS base

# Instalar dependências necessárias para o Prisma
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Stage para instalar dependências
FROM base AS deps
RUN npm ci --only=production && npm cache clean --force

# Stage para build da aplicação
FROM base AS build
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage de produção
FROM node:20-alpine AS runner
WORKDIR /app

# Criar usuário não-root por segurança
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copiar arquivos necessários
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./

# Gerar cliente Prisma no container final
RUN npx prisma generate

# Mudar ownership dos arquivos para o usuário nestjs
RUN chown -R nestjs:nodejs /app
USER nestjs

# Expor a porta da aplicação
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["npm", "run", "start:prod"]