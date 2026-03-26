import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class TranscriptionDto {
	/**
	 * Audio file to transcribe (MP3, WAV, FLAC, M4A, OGG, WebM — max 25 MB).
	 * @example file.mp3
	 */
	@ApiProperty({
		type: "string",
		format: "binary",
	})
	file: Express.Multer.File;

	/**
	 * ISO-639-1 language code. Defaults to 'bg' (Bulgarian).
	 * @example "bg"
	 */
	@IsOptional()
	@IsString()
	language?: string;
}
