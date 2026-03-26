import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const DB_USER = encodeURIComponent(env("POSTGRES_USER"));
const DB_PASSWORD = encodeURIComponent(env("POSTGRES_PASSWORD"));
const DB_HOST = env("POSTGRES_HOST");
const DB_NAME = env("POSTGRES_DB");

const url = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}`;

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
		seed: "tsx prisma/seed.ts",
	},
	datasource: { url },
});
