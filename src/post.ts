import { Action } from "@savvy-web/github-action-effects";
import { Effect } from "effect";

// Token revocation is handled by GitHubApp.withToken (acquireUseRelease)
// in main.ts. The post step runs unconditionally but has no cleanup to do.
const post = Effect.gen(function* () {
	yield* Effect.log("Post step complete");
});

/* v8 ignore next */
if (process.env.GITHUB_ACTIONS) Action.run(post);
