import "dotenv/config";
import { defineConfig } from "prisma/config";

const DB_USER = encodeURIComponent(process.env.POSTGRES_USER ?? "");
const DB_PASSWORD = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "");
const DB_HOST = process.env.POSTGRES_HOST ?? "";
const DB_NAME = process.env.POSTGRES_DB ?? "";

const url = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}`;

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
		seed: "tsx prisma/seed.ts",
	},
	datasource: { url },
});
