FROM node:22-alpine AS build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/tsconfig.json ./tsconfig.json
COPY client/index.html ./index.html
COPY client/src ./src
COPY shared ../shared
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
