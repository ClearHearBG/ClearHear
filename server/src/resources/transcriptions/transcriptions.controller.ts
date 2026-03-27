import {
	Body,
	Controller,
	Delete,
	Get,
	HttpStatus,
	Param,
	ParseFilePipeBuilder,
	ParseUUIDPipe,
	Post,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes } from "@nestjs/swagger";

import { ApiDelete, ApiGet, ApiPost } from "@decorators";

import { TranscriptionDto } from "./dto/transcription.dto";

import { TranscriptionEntity } from "./entities/transcription.entity";

import { Auth, type ClerkAuth } from "src/auth/public.decorator";

import { TranscriptionsService } from "./transcriptions.service";

@Controller("transcriptions")
export class TranscriptionsController {
	constructor(
		private readonly transcriptionsService: TranscriptionsService
	) {}

	/**
	 * Transcribes an audio file to text using Groq Whisper and saves the result.
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
		@Auth() auth: ClerkAuth,
		@Body("language") language: string
	): Promise<TranscriptionEntity> {
		return this.transcriptionsService.transcribe(
			file,
			auth.userId,
			language
		);
	}

	/**
	 * Returns all transcripts for the authenticated user.
	 */
	@Get()
	@ApiGet({ type: [TranscriptionEntity], errorResponses: [] })
	findAll(@Auth() auth: ClerkAuth): Promise<TranscriptionEntity[]> {
		return this.transcriptionsService.findAll(auth.userId);
	}

	/**
	 * Returns a single transcript by ID.
	 */
	@Get(":id")
	@ApiGet({ type: TranscriptionEntity })
	async findOne(
		@Param("id", ParseUUIDPipe) id: string,
		@Auth() auth: ClerkAuth
	): Promise<TranscriptionEntity> {
		return this.transcriptionsService.findOne(id, auth.userId);
	}

	/**
	 * Deletes a transcript by ID.
	 */
	@Delete(":id")
	@ApiDelete({ type: TranscriptionEntity })
	async remove(
		@Param("id", ParseUUIDPipe) id: string,
		@Auth() auth: ClerkAuth
	): Promise<TranscriptionEntity> {
		return this.transcriptionsService.remove(id, auth.userId);
	}
}
