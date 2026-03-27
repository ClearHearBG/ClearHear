import {
	BadRequestException,
	Injectable,
	UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Groq, { toFile } from "groq-sdk";

import { TranscriptionEntity } from "./entities/transcription.entity";

import { EnvironmentVariables } from "src/config/configuration";
import { PrismaService } from "src/prisma/prisma.service";
import { ProfilesService } from "src/profiles/profiles.service";

// Field names are per the OpenAI Whisper API specification:
// https://developers.openai.com/api/reference/resources/audio
interface TranscriptionSegment {
	id: number;
	seek: number;
	start: number;
	end: number;
	text: string;
	tokens: number[];
	temperature: number;
	avg_logprob: number;
	compression_ratio: number;
	no_speech_prob: number;
}

interface TranscriptionWord {
	word: string;
	start: number;
	end: number;
}

interface TranscriptionVerbose {
	language: string;
	duration: number;
	text: string;
	segments?: TranscriptionSegment[];
	words?: TranscriptionWord[];
}

// Per the Whisper spec, a segment is a hallucination when:
//   no_speech_prob is high AND avg_logprob < -1  (silence / noise)
//   compression_ratio > 2.4                       (repetitive / degenerate output)
//   gap from the previous segment is too large    (hallucination over silence)
// We stop at the first bad segment — everything after is typically hallucinated too.
const NO_SPEECH_THRESHOLD = 0.8;
const AVG_LOGPROB_THRESHOLD = -1;
const COMPRESSION_RATIO_THRESHOLD = 2.4;
const MAX_GAP_SECONDS = 10;

@Injectable()
export class TranscriptionsService {
	private readonly groq: Groq;

	constructor(
		private readonly configService: ConfigService<EnvironmentVariables>,
		private readonly prisma: PrismaService,
		private readonly profilesService: ProfilesService
	) {
		this.groq = new Groq({
			apiKey: this.configService.getOrThrow("groqApiKey", {
				infer: true,
			}),
		});
	}

	async transcribe(
		file: Express.Multer.File,
		clerkId: string,
		language: string
	): Promise<TranscriptionEntity> {
		if (!language?.trim()) {
			throw new BadRequestException("language is required");
		}

		let result: TranscriptionVerbose;

		try {
			result = (await this.groq.audio.transcriptions.create({
				file: await toFile(file.buffer, file.originalname, {
					type: file.mimetype,
				}),
				model: "whisper-large-v3",
				language,
				response_format: "verbose_json",
			})) as TranscriptionVerbose;
		} catch (error) {
			if (error instanceof Groq.APIError) {
				if (error.status === 400) {
					throw new BadRequestException(error.message);
				}
				if (error.status === 422) {
					throw new UnprocessableEntityException(error.message);
				}
			}

			throw error;
		}

		const goodSegments: TranscriptionSegment[] = [];

		let lastEnd = 0;

		for (const segment of result.segments ?? []) {
			const isSilent =
				segment.no_speech_prob >= NO_SPEECH_THRESHOLD &&
				segment.avg_logprob < AVG_LOGPROB_THRESHOLD;

			const isDegenerate =
				segment.compression_ratio > COMPRESSION_RATIO_THRESHOLD;

			const hasGap = segment.start - lastEnd > MAX_GAP_SECONDS;

			if (isSilent || isDegenerate || hasGap) {
				break;
			}

			goodSegments.push(segment);

			lastEnd = segment.end;
		}

		const text = goodSegments
			.map(segment => segment.text)
			.join("")
			.trim();

		const profile = await this.profilesService.findOrCreate(clerkId);

		const transcript = await this.prisma.transcript.create({
			data: {
				profileId: profile.id,
				text: text || result.text,
				language,
				duration: result.duration ?? null,
			},
		});

		return TranscriptionEntity.fromPlain(transcript);
	}

	async findAll(clerkId: string): Promise<TranscriptionEntity[]> {
		const profile = await this.profilesService.findOrCreate(clerkId);

		const transcripts = await this.prisma.transcript.findMany({
			where: { profileId: profile.id },
			orderBy: { createdAt: "desc" },
		});

		return transcripts.map(transcript =>
			TranscriptionEntity.fromPlain(transcript)
		);
	}

	async findOne(id: string, clerkId: string): Promise<TranscriptionEntity> {
		const profile = await this.profilesService.findOrCreate(clerkId);

		const transcript = await this.prisma.transcript.findUniqueOrThrow({
			where: { id, profileId: profile.id },
		});

		return TranscriptionEntity.fromPlain(transcript);
	}

	async remove(id: string, clerkId: string): Promise<TranscriptionEntity> {
		const profile = await this.profilesService.findOrCreate(clerkId);

		const transcript = await this.prisma.transcript.delete({
			where: { id, profileId: profile.id },
		});

		return TranscriptionEntity.fromPlain(transcript);
	}

	async removeAll(clerkId: string): Promise<void> {
		const profile = await this.profilesService.findOrCreate(clerkId);

		await this.prisma.transcript.deleteMany({
			where: { profileId: profile.id },
		});
	}
}
