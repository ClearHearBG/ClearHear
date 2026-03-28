import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
} from "@nestjs/common";

import { ApiGet, ApiPost } from "@decorators";

import { AskQuestionDto } from "./dto/ask-question.dto";

import { ChatMessageEntity } from "./entities/chat-message.entity";

import { Auth, type ClerkAuth } from "src/auth/public.decorator";

import { ChatService } from "./chat.service";

@Controller("transcriptions/:transcriptId/chat")
export class ChatController {
	constructor(private readonly chatService: ChatService) {}

	/**
	 * Asks a question about a transcript and returns the model's answer.
	 */
	@Post()
	@ApiPost({ type: ChatMessageEntity })
	ask(
		@Param("transcriptId", ParseUUIDPipe) transcriptId: string,
		@Auth() auth: ClerkAuth,
		@Body() dto: AskQuestionDto
	): Promise<ChatMessageEntity> {
		return this.chatService.ask(transcriptId, auth.userId, dto.question);
	}

	/**
	 * Returns the full chat history for a transcript.
	 */
	@Get()
	@ApiGet({ type: [ChatMessageEntity], errorResponses: [] })
	findAll(
		@Param("transcriptId", ParseUUIDPipe) transcriptId: string,
		@Auth() auth: ClerkAuth
	): Promise<ChatMessageEntity[]> {
		return this.chatService.findAll(transcriptId, auth.userId);
	}
}
