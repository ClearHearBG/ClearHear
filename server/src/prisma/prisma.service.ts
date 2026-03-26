import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "generated/prisma/client";
import { EnvironmentVariables } from "src/config/configuration";

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	constructor(
		private readonly configService: ConfigService<EnvironmentVariables>
	) {
		const pool = new PrismaPg({
			connectionString: configService.getOrThrow("database.url", {
				infer: true,
			}),
		});

		super({ adapter: pool });
	}

	async onModuleInit() {
		await this.$connect();
	}

	async onModuleDestroy() {
		await this.$disconnect();
	}
}
