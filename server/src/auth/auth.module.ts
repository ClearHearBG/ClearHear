import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { ClerkAuthGuard } from "./clerk-auth.guard";

@Module({
	providers: [
		ClerkAuthGuard,
		{
			provide: APP_GUARD,
			useExisting: ClerkAuthGuard,
		},
	],
	exports: [ClerkAuthGuard],
})
export class AuthModule {}
