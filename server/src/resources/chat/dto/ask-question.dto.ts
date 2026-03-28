import { ApiSchema } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

@ApiSchema({ description: "A question about a transcript" })
export class AskQuestionDto {
	/**
	 * The question to ask about the transcript.
	 * @example "What is the main topic discussed?"
	 */
	@IsString()
	@IsNotEmpty()
	question: string;
}
