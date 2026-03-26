/// <reference types="multer" />

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Groq, { toFile } from "groq-sdk";

// The Groq SDK types the transcription response as { text } regardless of
// response_format. When verbose_json is requested the actual payload includes
// segments with per-segment confidence metadata — we cast to access them.
interface VerboseSegment {
	start: number;
	end: number;
	text: string;
	no_speech_prob: number;
	avg_logprob: number;
}

interface VerboseTranscription {
	text: string;
	segments?: VerboseSegment[];
}

import { TranscriptionEntity } from "./entities/transcription.entity";

import { EnvironmentVariables } from "src/config/configuration";

@Injectable()
export class TranscriptionsService {
	private readonly groq: Groq;

	constructor(
		private readonly configService: ConfigService<EnvironmentVariables>
	) {
		this.groq = new Groq({
			apiKey: this.configService.getOrThrow("groqApiKey", {
				infer: true,
			}),
		});
	}

	async transcribe(
		file: Express.Multer.File,
		language = "bg"
	): Promise<TranscriptionEntity> {
		const result = (await this.groq.audio.transcriptions.create({
			file: await toFile(file.buffer, file.originalname, {
				type: file.mimetype,
			}),
			model: "whisper-large-v3",
			language,
			// Anchors the model to the target language, reducing hallucinations
			// and language bleed on unclear or silent segments.
			prompt: "Транскрипция на български език.",
			response_format: "verbose_json",
		})) as VerboseTranscription;

		// Whisper hallucinates text on silent/noisy segments. Two signals catch it:
		//   no_speech_prob — high when the segment is mostly silence or noise
		//   gap            — a large jump in timestamps signals hallucination over silence
		// avg_logprob is intentionally excluded: quiet real speech also scores low,
		// causing legitimate content to be cut off.
		// We stop at the first bad segment rather than filtering individually, because
		// everything after the first hallucination is almost always also hallucinated.
		const NO_SPEECH_THRESHOLD = 0.6;
		const MAX_GAP_SECONDS = 10;

		const goodSegments: VerboseSegment[] = [];
		let lastEnd = 0;

		for (const seg of result.segments ?? []) {
			const gap = seg.start - lastEnd;
			if (
				seg.no_speech_prob >= NO_SPEECH_THRESHOLD ||
				gap > MAX_GAP_SECONDS
			) {
				break;
			}
			goodSegments.push(seg);
			lastEnd = seg.end;
		}

		const text = goodSegments
			.map(seg => seg.text)
			.join("")
			.trim();

		return { text: text || result.text };
	}
}
