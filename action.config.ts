import { defineConfig } from "@savvy-web/github-action-builder";

export default defineConfig({
	entries: {
		main: "src/main.ts",
	},
	build: {
		minify: true,
		ignore: ["xmlbuilder2", "libxmljs2", "ajv-formats-draft2019"],
	},
	persistLocal: {
		enabled: false,
		path: ".github/actions/local",
	},
});
