import { Module } from "@nestjs/common";

import { PrismaModule } from "src/prisma/prisma.module";
import { ProfilesModule } from "src/profiles/profiles.module";

import { TranscriptionsController } from "./transcriptions.controller";
import { TranscriptionsService } from "./transcriptions.service";

@Module({
	imports: [PrismaModule, ProfilesModule],
	controllers: [TranscriptionsController],
	providers: [TranscriptionsService],
	exports: [TranscriptionsService],
})
export class TranscriptionsModule {}
