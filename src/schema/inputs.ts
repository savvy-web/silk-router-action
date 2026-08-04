import { ActionInput } from "@effected/github-actions";
import { Config, Effect, Option } from "effect";

/**
 * Every input this action declares, as data.
 *
 * @remarks
 * The middle leg of the three-way check that keeps `action.yml`, this tuple, and
 * the code that actually reads an input from drifting apart. The frozen contract
 * is **4 inputs** — see `.claude/plans/effected-github-actions-port/00-spec.md`.
 *
 * `token` appears here because the manifest declares it, but it is deliberately
 * absent from {@link ActionInputs}: it is consumed by
 * `GitHubClient.layerFromConfig({ name: "token" })` in `layers/app.ts`, which
 * reads it as a `Redacted` value through the runner's `INPUT_` derivation. No
 * program code ever sees it in plaintext.
 *
 * @public
 */
export const INPUT_NAMES = ["token", "release-branch", "target-branch", "release-prefix"] as const;

/** @public */
export type InputName = (typeof INPUT_NAMES)[number];

/**
 * Defaults, mirrored from `action.yml`.
 *
 * @remarks
 * Mirrored, never re-declared: `action.yml` is the single source of truth and
 * these values must equal it byte for byte. `token`'s manifest default is
 * `${{ github.token }}`, an expression the runner resolves, so it has no
 * literal counterpart here.
 *
 * @public
 */
export const INPUT_DEFAULTS = {
	"release-branch": "changeset-release/main",
	"target-branch": "main",
	"release-prefix": "release:",
} as const;

/**
 * The decoded inputs the program works with.
 *
 * @public
 */
export interface ActionInputs {
	readonly releaseBranch: string;
	readonly targetBranch: string;
	/** Empty disables the release-detection retry entirely. @see `steps/detect-phase.ts` */
	readonly releasePrefix: string;
}

/**
 * `release-prefix`, read so that an explicit empty value survives.
 *
 * @remarks
 * **Not `Config.withDefault`, and the difference is a frozen contract clause.**
 * `ActionInput.string` classifies both *absent* and *empty* as missing data, so
 * `withDefault("release:")` maps an explicit `release-prefix: ""` back to
 * `"release:"` — which makes ruling R1's *"empty `release-prefix` disables retry
 * entirely"* unimplementable. `Config.option` turns missing data into `None`
 * while still propagating genuine validation errors, so the three caller
 * intentions stay distinguishable.
 *
 * **This correctness depends on `action.yml` declaring `default: "release:"`.**
 * The runner publishes that default for an unsupplied input, so the variable is
 * only ever empty when a caller writes `release-prefix: ""` explicitly. Delete
 * the manifest default and every unsupplied run silently flips to
 * retry-disabled. `__test__/unit/parity.test.ts` pins that default — both by
 * iterating `INPUT_DEFAULTS` and by asserting this input specifically, because
 * the general mirror check stays green if the default is merely emptied.
 *
 * ⚠️ **Runner and bare-test environments differ here.** On a runner, unsupplied
 * means the variable is present carrying `"release:"`. In a bare test env,
 * omitting the key means genuinely absent — the opposite outcome. A test must
 * model the runner by supplying the manifest default explicitly.
 *
 * ---
 *
 * ⚠️ **UNVERIFIED PREMISE — this is the only tracked record of it.**
 *
 * Everything above assumes GitHub publishes an **empty** variable for an
 * explicitly-empty `with:` value, rather than substituting the `action.yml`
 * default. Believed true, since defaults are documented as applying to *omitted*
 * inputs — but **never verified on a real runner**, and **no local test can
 * verify it**, because nothing outside the runner applies manifest defaults.
 * Every test here seeds the "unsupplied" case by hand, so the suite stays green
 * either way.
 *
 * If GitHub substitutes the default, this read always sees `Some("release:")`,
 * the disable-by-empty behavior is unreachable, and the changeset entry claiming
 * it works is wrong and needs amending.
 *
 * **To settle it, on a real runner:**
 *
 * 1. Invoke this action from a workflow with `release-prefix: ""` explicitly set,
 *    on a push to the target branch whose head commit message begins `release:`.
 * 2. Watch the step's duration. Retry disabled → it returns promptly. Retry still
 *    enabled → roughly 30 seconds of waiting before it settles.
 * 3. Confirm against the log, which reports each retry it schedules.
 *
 * A passing result closes this out. A failing result means removing the
 * disable-by-empty behavior from the changeset and from `action.yml`'s
 * description, and reopening how a caller turns the retry off.
 *
 * @internal
 */
const releasePrefixConfig: Config.Config<string> = Config.option(ActionInput.string("release-prefix")).pipe(
	Config.map(Option.getOrElse(() => "")),
);

/**
 * Read and normalize every program-visible input, once.
 *
 * @remarks
 * One pass rather than scattered reads, so normalization cannot diverge between
 * call sites. Read through {@link ActionInput} rather than a bare `Config`
 * spelling: the runner publishes `INPUT_<MANGLED>` names, and a hand-spelled
 * flat read silently falls through to its default.
 *
 * @public
 */
export const readInputs: Effect.Effect<ActionInputs, Config.ConfigError> = Effect.gen(function* () {
	const releaseBranch = yield* ActionInput.string("release-branch").pipe(
		Config.withDefault(INPUT_DEFAULTS["release-branch"]),
	);
	const targetBranch = yield* ActionInput.string("target-branch").pipe(
		Config.withDefault(INPUT_DEFAULTS["target-branch"]),
	);
	// Not `withDefault` — see `releasePrefixConfig`. An explicit `""` must survive
	// as `""`, because that is how a caller disables the retry.
	const releasePrefix = yield* releasePrefixConfig;
	return { releaseBranch, targetBranch, releasePrefix };
});
