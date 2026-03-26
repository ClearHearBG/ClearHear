import {
	Body,
	Controller,
	Post,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes } from "@nestjs/swagger";

import { ApiPost } from "@decorators";

import { TranscriptionDto } from "./dto/transcription.dto";

import { TranscriptionEntity } from "./entities/transcription.entity";

import { TranscriptionsService } from "./transcriptions.service";

@Controller("transcriptions")
export class TranscriptionsController {
	constructor(
		private readonly transcriptionsService: TranscriptionsService
	) {}

	/**
	 * Transcribes an audio file to text using Groq Whisper.
	 */
	@Post()
	@ApiPost({ type: TranscriptionEntity })
	@ApiConsumes("multipart/form-data")
	@UseInterceptors(
		FileInterceptor("file", { limits: { fileSize: 25 * 1024 * 1024 } })
	)
	async transcribe(
		@UploadedFile() file: Express.Multer.File,
		@Body() { language }: TranscriptionDto
	): Promise<TranscriptionEntity> {
		return this.transcriptionsService.transcribe(file, language);
	}
}
