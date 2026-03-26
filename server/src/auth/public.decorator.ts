import {
	createParamDecorator,
	ExecutionContext,
	SetMetadata,
} from "@nestjs/common";
import type { Request } from "express";

export const IS_PUBLIC_KEY = "isPublic";

export interface ClerkAuth {
	token: string;
	userId: string;
	sessionId?: string;
	orgId: string | null;
	claims: Record<string, unknown>;
}

export interface AuthenticatedRequest extends Request {
	auth?: ClerkAuth;
}

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Auth = createParamDecorator(
	(_data: unknown, context: ExecutionContext): ClerkAuth | undefined => {
		const request = context
			.switchToHttp()
			.getRequest<AuthenticatedRequest>();

		return request.auth;
	}
);
