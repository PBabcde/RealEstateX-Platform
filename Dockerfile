
FROM node:22

WORKDIR /app

RUN npm install -g pnpm

# Native dependencies voor Vite in Docker monorepo


COPY . .

# Installeer dependencies inclusief native modules
RUN pnpm install --dangerously-allow-all-builds 

RUN pnpm run build

EXPOSE 3000
CMD ["pnpm", "run", "start", "--filter", "realestatex-platform"]




 
