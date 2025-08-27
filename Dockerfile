FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV DOCS_DIR=docs
ENTRYPOINT ["node","dist/cli.js"]
