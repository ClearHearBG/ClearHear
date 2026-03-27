import { ApiProperty, ApiSchema } from "@nestjs/swagger";

@ApiSchema({ description: "The data required to transcribe an audio file" })
export class TranscriptionDto {
	/**
	 * Audio file to transcribe (MP3, WAV, FLAC, M4A, OGG, WebM — max 25 MB).
	 */
	@ApiProperty({ type: "string", format: "binary" })
	file: any;

	/**
	 * ISO-639-1 language code of the audio.
	 * @example "bg"
	 */
	@ApiProperty({ example: "bg" })
	language: string;
}
