import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./auth/auth.module";
import configuration, {
	environmentVariablesValidationSchema,
} from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";
import { ProfilesModule } from "./profiles/profiles.module";

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [configuration],
			validationSchema: environmentVariablesValidationSchema,
		}),
		AuthModule,
		PrismaModule,
		ProfilesModule,
	],
})
export class AppModule {}
