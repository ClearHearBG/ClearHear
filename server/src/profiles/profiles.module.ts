import { Module } from "@nestjs/common";

import { PrismaModule } from "src/prisma/prisma.module";

import { ProfilesService } from "./profiles.service";

@Module({
	imports: [PrismaModule],
	providers: [ProfilesService],
	exports: [ProfilesService],
})
export class ProfilesModule {}
