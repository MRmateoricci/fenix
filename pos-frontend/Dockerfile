FROM node:22-bookworm-slim AS build

WORKDIR /app

# Mismo criterio que el Dockerfile de la tienda: `npm install` (no `ci`) porque el
# lockfile se genera en Windows y le faltan los binarios nativos de Linux de
# Tailwind/Vite.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Railway solo pasa las variables al build si se declaran con ARG. VITE_API_URL es
# el origen del backend (la tienda) y queda incorporada al JS del POS en este
# paso: cambiarla después exige redeployar.
ARG VITE_API_URL

# Sin esta variable el POS llamaría a /api en su propio dominio, donde no hay
# backend. Mejor cortar el build que publicar un POS que no puede loguear a nadie.
# Se le saca la barra final para no armar URLs como https://x.com//api/...
RUN test -n "$VITE_API_URL" || { echo "Falta VITE_API_URL: cargala en las variables del servicio del POS (ej. https://fenixelectricidadiluminacion.com)"; exit 1; } \
    && VITE_API_URL="${VITE_API_URL%/}" npm run build


FROM caddy:2-alpine AS runtime

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

# Railway inyecta PORT; el Caddyfile lo toma de ahí (8080 si no viene).
EXPOSE 8080
