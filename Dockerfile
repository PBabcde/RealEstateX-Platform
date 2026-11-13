
FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY . .

RUN pnpm install --dangerously-allow-all-builds
RUN pnpm run build

EXPOSE 3000
CMD ["pnpm", "run", "start"]


 
