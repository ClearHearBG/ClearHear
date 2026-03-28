import { Module } from "@nestjs/common";

import { PrismaModule } from "src/prisma/prisma.module";
import { TranscriptionsModule } from "src/resources/transcriptions/transcriptions.module";

import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
	imports: [PrismaModule, TranscriptionsModule],
	controllers: [ChatController],
	providers: [ChatService],
})
export class ChatModule {}
