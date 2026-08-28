FROM node:22-bookworm-slim AS build

WORKDIR /app

# Copiar primero los manifiestos mantiene en cache la instalacion mientras no
# cambien las dependencias. El postinstall raiz instala tambien las del backend.
COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# PostgreSQL de produccion usa la version 18. Instalamos el cliente de la misma
# version desde el repositorio oficial PGDG para disponer de pg_dump y psql.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl openssl; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl --fail --silent --show-error \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc; \
    . /etc/os-release; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-18; \
    pg_dump --version; \
    psql --version; \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/backend ./backend
COPY --from=build /app/dist ./dist
# El seed y la generacion de facturas referencian recursos dentro de src.
COPY --from=build /app/src ./src

EXPOSE 3001

CMD ["npm", "start"]
