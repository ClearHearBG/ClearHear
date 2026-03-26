import { ApiSchema } from "@nestjs/swagger";

@ApiSchema({ description: "The result of an audio transcription" })
export class TranscriptionEntity {
	/**
	 * The transcribed text from the audio file.
	 * @example "Hello, this is a test transcription."
	 */
	text: string;
}
