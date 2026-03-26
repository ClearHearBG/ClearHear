import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import configuration, {
	environmentVariablesValidationSchema,
} from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [configuration],
			validationSchema: environmentVariablesValidationSchema,
		}),
		PrismaModule,
	],
})
export class AppModule {}
