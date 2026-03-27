import {
	Body,
	Controller,
	HttpStatus,
	ParseFilePipeBuilder,
	Post,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes } from "@nestjs/swagger";

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
	@ApiBody({ type: TranscriptionDto })
	@UseInterceptors(FileInterceptor("file"))
	async transcribe(
		@UploadedFile(
			new ParseFilePipeBuilder()
				.addMaxSizeValidator({ maxSize: 25 * 1024 * 1024 })
				.build({
					errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
					fileIsRequired: true,
				})
		)
		file: Express.Multer.File,
		@Body("language") language?: string
	): Promise<TranscriptionEntity> {
		return this.transcriptionsService.transcribe(file, language);
	}
}
