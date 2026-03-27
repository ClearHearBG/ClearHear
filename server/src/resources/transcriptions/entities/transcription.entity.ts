import { ApiSchema } from "@nestjs/swagger";
import { Exclude, plainToInstance } from "class-transformer";

import { Transcript } from "generated/prisma/client";

@ApiSchema({ description: "A stored transcript" })
export class TranscriptionEntity implements Transcript {
	static fromPlain(plain: Partial<TranscriptionEntity>): TranscriptionEntity {
		return plainToInstance(TranscriptionEntity, plain);
	}

	/**
	 * The unique identifier for the transcript.
	 * @example "123e4567-e89b-12d3-a456-426614174000"
	 */
	id: string;

	/**
	 * The unique identifier of the profile that owns this transcript.
	 * @example "123e4567-e89b-12d3-a456-426614174000"
	 */
	@Exclude()
	profileId: string;

	/**
	 * The transcribed text.
	 * @example "Като много други истински чудеса..."
	 */
	text: string;

	/**
	 * The ISO-639-1 language code of the audio.
	 * @example "bg"
	 */
	language: string;

	/**
	 * Duration of the audio in seconds.
	 * @example 42.5
	 */
	duration: number | null;

	/**
	 * The date and time when the transcript was created.
	 * @example "2024-01-01T00:00:00.000Z"
	 */
	createdAt: Date;

	/**
	 * The date and time when the transcript was last updated.
	 * @example "2024-01-01T00:00:00.000Z"
	 */
	updatedAt: Date;
}
