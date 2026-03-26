import Joi from "joi";

export interface DatabaseConfig {
	url: string;
}

export interface EnvironmentVariables {
	database: DatabaseConfig;
}

export const environmentVariablesValidationSchema = Joi.object({
	POSTGRES_USER: Joi.string().required(),
	POSTGRES_PASSWORD: Joi.string().required(),
	POSTGRES_HOST: Joi.string().required(),
	POSTGRES_DB: Joi.string().required(),
});

export default (): EnvironmentVariables => {
	const DB_USER = encodeURIComponent(process.env.POSTGRES_USER!);
	const DB_PASSWORD = encodeURIComponent(process.env.POSTGRES_PASSWORD!);
	const DB_HOST = process.env.POSTGRES_HOST!;
	const DB_NAME = process.env.POSTGRES_DB!;

	return {
		database: {
			url: `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}`,
		},
	};
};
