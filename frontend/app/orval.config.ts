import { defineConfig } from "orval";
import dotenv from "dotenv";

dotenv.config({
	path: ".env.local",
});

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
	throw new Error("EXPO_PUBLIC_API_URL is not defined in the environment variables.");
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
			override: {
				mutator: {
					path: "./src/api/mutator/custom-instance.ts",
					name: "customInstance",
				},
			},
		},
	},
});
