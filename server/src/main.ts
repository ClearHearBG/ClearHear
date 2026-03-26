import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { PrismaClientExceptionFilter } from "@shared/filters/prisma-client-exception/prisma-client-exception.filter";

import { AppModule } from "./app.module";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
		})
	);

	app.useGlobalInterceptors(
		new ClassSerializerInterceptor(app.get(Reflector))
	);

	const config = new DocumentBuilder()
		.setTitle("ClearHear API")
		.setVersion("1.0")
		.addServer("/")
		.build();

	const documentFactory = () =>
		SwaggerModule.createDocument(app, config, {
			operationIdFactory: (controllerKey: string, methodKey: string) =>
				`${controllerKey}${methodKey.charAt(0).toUpperCase()}${methodKey.slice(1)}`,
		});

	SwaggerModule.setup("api", app, documentFactory, {
		swaggerOptions: {
			docExpansion: "none", // collapse operations by default
			tagsSorter: "alpha", // sort tags alphabetically
		},
	});

	app.useGlobalFilters(new PrismaClientExceptionFilter());

	await app.listen(process.env.PORT ?? 8393);
}

bootstrap().catch(error => {
	console.error("Error starting the application:", error);
	process.exit(1);
});
