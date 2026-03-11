import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "packages/protocol-core/prisma/schema.prisma",
  migrations: {
    path: "packages/protocol-core/prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
