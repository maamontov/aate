FROM node:22-alpine AS deps
WORKDIR /app/server
COPY server/package.json ./
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/package.json ./package.json
COPY server/tsconfig.json ./tsconfig.json
COPY server/src ./src
COPY shared ../shared
COPY questions ../questions
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/questions ../questions
COPY server/package.json ./package.json
COPY --from=deps /app/server/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/server/src/index.js"]
