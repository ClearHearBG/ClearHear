import { Injectable } from "@nestjs/common";

import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class ProfilesService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Returns the profile for the given Clerk user, creating it if it doesn't exist yet.
	 * Call this on first authenticated request so the profile is always present.
	 */
	findOrCreate(clerkId: string) {
		return this.prisma.profile.upsert({
			where: { clerkId },
			update: {},
			create: { clerkId },
		});
	}

	findByClerkId(clerkId: string) {
		return this.prisma.profile.findUniqueOrThrow({
			where: { clerkId },
		});
	}

	remove(clerkId: string) {
		return this.prisma.profile.delete({
			where: { clerkId },
		});
	}
}
