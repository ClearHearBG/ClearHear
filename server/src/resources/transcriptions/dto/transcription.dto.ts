import { ApiProperty, ApiSchema } from "@nestjs/swagger";

@ApiSchema({ description: "The data required to transcribe an audio file" })
export class TranscriptionDto {
	/**
	 * Audio file to transcribe (MP3, WAV, FLAC, M4A, OGG, WebM — max 25 MB).
	 */
	@ApiProperty({ type: "string", format: "binary" })
	file: any;

	/**
	 * ISO-639-1 language code. Defaults to 'bg' (Bulgarian).
	 * @example "bg"
	 */
	@ApiProperty({ required: false, example: "bg" })
	language?: string;
}
