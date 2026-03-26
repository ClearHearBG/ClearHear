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

		const secretKey = this.configService.getOrThrow("clerk.secretKey", {
			infer: true,
		});
		const jwtKey = this.configService.get("clerk.jwtKey", { infer: true });
		const claims = await this.verifyRequestToken(token, secretKey, jwtKey);
		const userId = claims.sub;

		if (!userId) {
			throw new UnauthorizedException("Access credentials are invalid");
		}

		request.auth = this.createAuthObject(claims);

		return true;
	}

	private createAuthObject(
		claims: Awaited<ReturnType<typeof verifyToken>>
	): ClerkAuth {
		const orgId = this.getStringClaim(claims, "org_id");

		return {
			userId: claims.sub,
			sessionId: claims.sid,
			orgId,
			claims,
		};
	}

	private extractBearerToken(request: Request): string | null {
		const authorization = request.headers.authorization;

		if (!authorization) {
			return null;
		}

		const trimmed = authorization.trim();

		if (!trimmed) {
			return null;
		}

		const [scheme, ...rest] = trimmed.split(/\s+/);

		if (!scheme || rest.length === 0) {
			return null;
		}

		if (scheme.toLowerCase() !== "bearer") {
			return null;
		}

		const token = rest.join(" ");

		return token || null;
	}

	private async verifyRequestToken(
		token: string,
		secretKey: string,
		jwtKey?: string
	): Promise<Awaited<ReturnType<typeof verifyToken>>> {
		try {
			return await verifyToken(token, {
				secretKey,
				jwtKey,
				authorizedParties: this.getAuthorizedParties(),
			});
		} catch (error) {
			if (this.isAuthenticationFailure(error)) {
				throw new UnauthorizedException(
					"Access credentials are invalid"
				);
			}

			throw error;
		}
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

	private isAuthenticationFailure(error: unknown): error is Error & {
		reason: string;
	} {
		return (
			error instanceof SyntaxError ||
			(error instanceof Error &&
				"reason" in error &&
				typeof error.reason === "string")
		);
	}
}
