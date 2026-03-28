import { Schema } from "effect";

export const Phase = Schema.Literal(
	"silk-branch",
	"silk-validate",
	"silk-publish",
	"silk-release",
	"close-issues",
	"skip",
).annotations({ identifier: "Phase", title: "Silk Pipeline Phase" });

export type PhaseType = typeof Phase.Type;
