import { defineConfig } from "orval";
import dotenv from "dotenv";

dotenv.config({
	path: ".env.local",
});

const apiUrl = process.env.API_URL;

if (!apiUrl) {
	throw new Error("API_URL is not defined in the environment variables.");
}

export default defineConfig({
	api: {
		input: {
			target: `${apiUrl}/api-json`,
		},
		output: {
			mode: "tags-split",
			target: "./src/api/generated/endpoints",
			schemas: "./src/api/generated/models",
			client: "axios",
			prettier: true,
		},
	},
});
