import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

import { ChatMessageEntity } from "./entities/chat-message.entity";

import { EnvironmentVariables } from "src/config/configuration";
import { PrismaService } from "src/prisma/prisma.service";
import { TranscriptionsService } from "src/resources/transcriptions/transcriptions.service";

@Injectable()
export class ChatService {
	private readonly openai: OpenAI;
	private readonly chatModel: string;

	constructor(
		private readonly configService: ConfigService<EnvironmentVariables>,
		private readonly prisma: PrismaService,
		private readonly transcriptionsService: TranscriptionsService
	) {
		this.openai = new OpenAI({
			...this.configService.getOrThrow("lmStudio", {
				infer: true,
			}),
		});

		this.chatModel = this.configService.getOrThrow("lmStudio.chatModel", {
			infer: true,
		});
	}

	async ask(
		transcriptId: string,
		clerkId: string,
		question: string
	): Promise<ChatMessageEntity> {
		const transcript = await this.transcriptionsService.findOne(
			transcriptId,
			clerkId
		);

		const completion = await this.openai.chat.completions.create({
			model: this.chatModel,
			messages: [
				{
					role: "system",
					content: `
					You are a transcript assistant. You ONLY answer questions about the transcript below.
					If the question is not about the transcript, respond with exactly: "I can only answer questions about this transcript."
					Do not answer questions about yourself, the current time, or anything else outside the transcript.\n\n
					Transcript:\n${transcript.text}
					`,
				},
				{ role: "user", content: question },
			],
		});

		const answer = completion.choices[0]?.message.content ?? "";

		const chatMessage = await this.prisma.chatMessage.create({
			data: { transcriptId, question, answer },
		});

		return ChatMessageEntity.fromPlain(chatMessage);
	}

	async findAll(
		transcriptId: string,
		clerkId: string
	): Promise<ChatMessageEntity[]> {
		// Verify ownership of the transcript
		await this.transcriptionsService.findOne(transcriptId, clerkId);

		const messages = await this.prisma.chatMessage.findMany({
			where: { transcriptId },
			orderBy: { createdAt: "asc" },
		});

		return messages.map(message => ChatMessageEntity.fromPlain(message));
	}
}
