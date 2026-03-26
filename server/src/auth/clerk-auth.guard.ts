import { verifyToken } from "@clerk/backend";
import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import {
	type AuthenticatedRequest,
	type ClerkAuth,
	IS_PUBLIC_KEY,
} from "./public.decorator";
import type { EnvironmentVariables } from "../config/configuration";

@Injectable()
export class ClerkAuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly configService: ConfigService<EnvironmentVariables>
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(
			IS_PUBLIC_KEY,
			[context.getHandler(), context.getClass()]
		);

		if (isPublic) {
			return true;
		}

		const request = context
			.switchToHttp()
			.getRequest<AuthenticatedRequest>();
		const token = this.extractBearerToken(request);

		if (!token) {
			throw new UnauthorizedException("Access credentials are invalid");
		}

		try {
			const claims = await verifyToken(token, {
				secretKey: this.configService.getOrThrow("clerk.secretKey", {
					infer: true,
				}),
				jwtKey: this.configService.get("clerk.jwtKey", { infer: true }),
				authorizedParties: this.getAuthorizedParties(),
			});

			const userId = claims.sub;

			if (!userId) {
				throw new UnauthorizedException(
					"Access credentials are invalid"
				);
			}

			request.auth = this.createAuthObject(token, claims);

			return true;
		} catch {
			throw new UnauthorizedException("Access credentials are invalid");
		}
	}

	private createAuthObject(
		token: string,
		claims: Awaited<ReturnType<typeof verifyToken>>
	): ClerkAuth {
		const orgId = this.getStringClaim(claims, "org_id");

		return {
			token,
			userId: claims.sub,
			sessionId: claims.sid,
			orgId,
			claims,
		};
	}

	private extractBearerToken(request: Request): string | null {
		const [scheme, token] = request.headers.authorization?.split(" ") ?? [];

		if (scheme !== "Bearer" || !token) {
			return null;
		}

		return token;
	}

	private getAuthorizedParties(): string[] | undefined {
		const authorizedParties = this.configService.get(
			"clerk.authorizedParties",
			{
				infer: true,
			}
		);

		if (!authorizedParties?.length) {
			return undefined;
		}

		return authorizedParties;
	}

	private getStringClaim(
		claims: Awaited<ReturnType<typeof verifyToken>>,
		key: string
	): string | null {
		const value = (claims as Record<string, unknown>)[key];

		return typeof value === "string" ? value : null;
	}
}
