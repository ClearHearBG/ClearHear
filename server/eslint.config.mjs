// @ts-check
import { fixupPluginRules } from "@eslint/compat";
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import _import from "eslint-plugin-import";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
	{
		ignores: [
			"eslint.config.mjs",
			"dist/**",
			"node_modules/**",
			"generated/**",
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	eslintPluginPrettierRecommended,
	{
		// Wrap the import plugin to ensure compatibility with Flat Config
		plugins: {
			import: fixupPluginRules(_import),
		},
		languageOptions: {
			globals: {
				...globals.node,
				...globals.jest,
			},
			// Set to 'module' because NestJS source code uses ES Modules (import/export)
			sourceType: "module",
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		settings: {
			"import/resolver": {
				typescript: {
					alwaysTryTypes: true,
					project: "./tsconfig.json",
				},
				node: {
					extensions: [".js", ".jsx", ".ts", ".tsx"],
				},
			},
		},
		rules: {
			// TypeScript Specific Rules
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-floating-promises": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
			"@typescript-eslint/interface-name-prefix": "off",
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",

			// Prettier Integration
			"prettier/prettier": ["error", { endOfLine: "auto" }],

			// Import Sorting Logic
			"sort-imports": [
				"error",
				{
					ignoreCase: true,
					ignoreDeclarationSort: true,
					ignoreMemberSort: false,
					memberSyntaxSortOrder: [
						"none",
						"all",
						"multiple",
						"single",
					],
				},
			],
			"import/no-duplicates": "error",
			"import/order": [
				"error",
				{
					"groups": [
						"builtin",
						"external",
						"internal",
						["parent", "sibling", "index"],
					],
					"pathGroups": [
						{
							pattern: "@resources/**",
							group: "internal",
							position: "before",
						},
						{
							pattern: "@shared/**",
							group: "internal",
							position: "before",
						},
						{
							pattern: "@decorators",
							group: "internal",
							position: "before",
						},
						{
							pattern: "@decorators/**",
							group: "internal",
							position: "before",
						},
						{
							pattern: "@prisma/**",
							group: "internal",
							position: "before",
						},
						{
							pattern: "./dto/**",
							group: "internal",
							position: "before",
						},
						{
							pattern: "./entities/**",
							group: "internal",
							position: "before",
						},
						{ pattern: "*", group: "internal", position: "after" },
					],
					"newlines-between": "always",
					"alphabetize": {
						order: "asc",
						caseInsensitive: true,
					},
				},
			],
		},
	}
);
