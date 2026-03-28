import { Context, Effect, Layer } from "effect";
import type { PhaseType } from "../schemas/phase.js";
import type { ReleasePlanType } from "../schemas/release-plan.js";

export class SummaryWriter extends Context.Tag("silk-router/SummaryWriter")<
	SummaryWriter,
	{
		readonly generate: (phase: PhaseType, reason: string, plan: ReleasePlanType) => Effect.Effect<string>;
	}
>() {}

const generateMarkdown = (phase: PhaseType, reason: string, plan: ReleasePlanType): string => {
	const lines: string[] = [];
	lines.push("## Silk Router", "");
	lines.push(`**Phase:** \`${phase}\``);
	lines.push(`**Reason:** ${reason}`, "");

	if (plan.changesetCount > 0) {
		lines.push(`**Changesets:** ${plan.changesetCount} (highest bump: \`${plan.bump}\`)`);
		lines.push(`**Tag Strategy:** \`${plan.tagStrategy}\``, "");
	}

	if (plan.releases.length > 0) {
		lines.push("### Releases", "");
		lines.push("| Package | Bump | Old Version | New Version | Registries |");
		lines.push("| ------- | ---- | ----------- | ----------- | ---------- |");
		for (const release of plan.releases) {
			const registryNames = release.registries.map((r) => r.registry.name).join(", ") || "none";
			lines.push(
				`| ${release.workspace} | ${release.type} | ${release.oldVersion} | ${release.newVersion || "TBD"} | ${registryNames} |`,
			);
		}
		lines.push("");

		const hasRegistries = plan.releases.some((r) => r.registries.length > 0);
		if (hasRegistries) {
			lines.push("### Publish Targets", "");
			lines.push("| Package | Published As | Protocol | Source |");
			lines.push("| ------- | ----------- | -------- | ------ |");
			for (const release of plan.releases) {
				for (const target of release.registries) {
					lines.push(`| ${release.workspace} | ${target.as} | ${target.registry.protocol} | ${target.source} |`);
				}
			}
			lines.push("");
		}
	}

	return lines.join("\n");
};

export const SummaryWriterLive = Layer.succeed(SummaryWriter, {
	generate: (phase, reason, plan) => Effect.succeed(generateMarkdown(phase, reason, plan)),
});

export const SummaryWriterTest = {
	captureLayer: () =>
		Layer.succeed(SummaryWriter, {
			generate: (phase, reason, plan) => Effect.succeed(generateMarkdown(phase, reason, plan)),
		}),
};
