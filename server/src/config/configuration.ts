import * as Joi from "joi";

export interface DatabaseConfig {
	url: string;
}

export interface ClerkConfig {
	secretKey: string;
	jwtKey?: string;
	authorizedParties: string[];
}

export interface LmStudioConfig {
	baseUrl: string;
	apiKey: string;
	chatModel: string;
}

export interface EnvironmentVariables {
	database: DatabaseConfig;
	clerk: ClerkConfig;
	groqApiKey: string;
	lmStudio: LmStudioConfig;
}

export const environmentVariablesValidationSchema = Joi.object({
	// Database credentials
	POSTGRES_USER: Joi.string().required(),
	POSTGRES_PASSWORD: Joi.string().required(),
	POSTGRES_HOST: Joi.string().required(),
	POSTGRES_DB: Joi.string().required(),

	// Clerk credentials
	CLERK_SECRET_KEY: Joi.string().required(),
	CLERK_JWT_KEY: Joi.string().allow("").optional(),
	CLERK_AUTHORIZED_PARTIES: Joi.string().allow("").optional(),

	// Groq API key
	GROQ_API_KEY: Joi.string().required(),

	// LM Studio credentials
	LMSTUDIO_BASE_URL: Joi.string().required(),
	LMSTUDIO_API_KEY: Joi.string().required(),
	LMSTUDIO_CHAT_MODEL: Joi.string().required(),
});

export default (): EnvironmentVariables => {
	const DB_USER = encodeURIComponent(process.env.POSTGRES_USER!);
	const DB_PASSWORD = encodeURIComponent(process.env.POSTGRES_PASSWORD!);
	const DB_HOST = process.env.POSTGRES_HOST!;
	const DB_NAME = process.env.POSTGRES_DB!;

	const clerkJwtKey = process.env.CLERK_JWT_KEY?.trim() ?? undefined;

	const clerkAuthorizedParties =
		process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
			.map(value => value.trim())
			.filter(Boolean) ?? [];

	return {
		database: {
			url: `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}`,
		},

		clerk: {
			secretKey: process.env.CLERK_SECRET_KEY!,
			jwtKey: clerkJwtKey,
			authorizedParties: clerkAuthorizedParties,
		},

		groqApiKey: process.env.GROQ_API_KEY!,

		lmStudio: {
			baseUrl: process.env.LMSTUDIO_BASE_URL!,
			apiKey: process.env.LMSTUDIO_API_KEY!,
			chatModel: process.env.LMSTUDIO_CHAT_MODEL!,
		},
	};
};
