import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { TranscriptionEntity } from "./entities/transcription.entity";

import { EnvironmentVariables } from "src/config/configuration";
import { PrismaService } from "src/prisma/prisma.service";
import { ProfilesService } from "src/profiles/profiles.service";

@Injectable()
export class TranscriptionsService {
	private readonly inferenceURL: string;

	constructor(
		private readonly configService: ConfigService<EnvironmentVariables>,
		private readonly prisma: PrismaService,
		private readonly profilesService: ProfilesService
	) {
		const { baseURL } = this.configService.getOrThrow("whisper", {
			infer: true,
		});

		this.inferenceURL = `${baseURL}/inference`;
	}

	async transcribe(
		file: Express.Multer.File,
		clerkId: string,
		language: string
	): Promise<TranscriptionEntity> {
		if (!language?.trim()) {
			throw new BadRequestException("language is required");
		}

		const form = new FormData();

		form.append(
			"file",
			new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
			file.originalname
		);

		form.append("language", language);
		form.append("response_format", "text");

		const response = await fetch(this.inferenceURL, {
			method: "POST",
			body: form,
		});

		if (response.status === 400) {
			throw new BadRequestException(await response.text());
		}

		if (response.status === 422) {
			throw new UnprocessableEntityException(await response.text());
		}

		if (!response.ok) {
			throw new InternalServerErrorException(
				`Whisper server error: ${response.status} ${response.statusText}`
			);
		}

		const text = (await response.text()).trim();

		const profile = await this.profilesService.findOrCreate(clerkId);

		const transcript = await this.prisma.transcript.create({
			data: {
				profileId: profile.id,
				text,
				language,
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
