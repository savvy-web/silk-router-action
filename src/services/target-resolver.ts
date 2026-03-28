import { Context, Effect, Layer } from "effect";
import { TargetResolutionError } from "../errors/errors.js";
import type { RegistryTargetType } from "../schemas/registry.js";

export class TargetResolver extends Context.Tag("silk-router/TargetResolver")<
	TargetResolver,
	{
		readonly resolve: (
			packageName: string,
			packagePath: string,
		) => Effect.Effect<ReadonlyArray<RegistryTargetType>, TargetResolutionError>;
	}
>() {}

const resolveTarget = (
	packageName: string,
	packagePath: string,
	target: {
		name?: string;
		registry?: string;
		protocol?: string;
		provenance?: boolean;
		directory?: string;
	},
): RegistryTargetType => {
	const protocol = (target.protocol ?? "npm") as "npm" | "jsr";
	const publishedAs = target.name ?? packageName;
	const sourceDir = target.directory ? `${packagePath}/${target.directory}` : packagePath;

	if (protocol === "jsr") {
		return {
			as: publishedAs,
			source: sourceDir,
			registry: { id: "jsr", name: "JSR", protocol: "jsr", params: {}, artifacts: [] },
		};
	}

	const registryUrl = target.registry ?? "https://registry.npmjs.org";
	const id = registryUrl.includes("npm.pkg.github.com") ? "github" : "npm";
	const name = id === "github" ? "GitHub Packages" : "npm";

	return {
		as: publishedAs,
		source: sourceDir,
		registry: {
			id,
			name,
			protocol: "npm",
			params: { registry: registryUrl, provenance: target.provenance ?? true },
			artifacts: [],
		},
	};
};

export const TargetResolverLive = Layer.succeed(TargetResolver, {
	resolve: (packageName, packagePath) =>
		Effect.gen(function* () {
			const path = yield* Effect.promise(() => import("node:path"));
			const fs = yield* Effect.promise(() => import("node:fs"));
			const pkgJsonPath = path.resolve(packagePath, "package.json");

			if (!fs.existsSync(pkgJsonPath)) {
				return [];
			}

			const raw = fs.readFileSync(pkgJsonPath, "utf-8");
			const pkg = JSON.parse(raw) as {
				private?: boolean;
				publishConfig?: {
					access?: string;
					registry?: string;
					directory?: string;
					targets?: Array<{
						name?: string;
						registry?: string;
						protocol?: string;
						provenance?: boolean;
						directory?: string;
					}>;
				};
			};

			if (pkg.private && !pkg.publishConfig?.access) {
				return [];
			}

			const publishConfig = pkg.publishConfig;

			if (publishConfig?.targets && Array.isArray(publishConfig.targets)) {
				return publishConfig.targets.map((target) => resolveTarget(packageName, packagePath, target));
			}

			const registry = publishConfig?.registry ?? "https://registry.npmjs.org";
			const sourceDir = publishConfig?.directory ? path.join(packagePath, publishConfig.directory) : packagePath;

			return [
				{
					as: packageName,
					source: sourceDir,
					registry: {
						id: "npm",
						name: "npm",
						protocol: "npm" as const,
						params: { registry, provenance: true },
						artifacts: [],
					},
				},
			];
		}).pipe(
			Effect.catchAllDefect((defect) =>
				Effect.fail(new TargetResolutionError({ packageName, reason: `Failed to resolve targets: ${String(defect)}` })),
			),
		),
});

export const TargetResolverTest = {
	layer: (targets: Record<string, ReadonlyArray<RegistryTargetType>>) =>
		Layer.succeed(TargetResolver, {
			resolve: (packageName) => Effect.succeed(targets[packageName] ?? []),
		}),
};
