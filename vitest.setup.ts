/**
 * Strip the runner's own marker variables from the test process.
 *
 * @remarks
 * `src/main.ts` guards its `Action.run` call on `GITHUB_ACTIONS`, so a suite
 * that imported it while that variable was set would execute the action as an
 * import side effect, mid-run. Deleting it here — in the main process, before
 * vitest forks its workers, which inherit this environment — makes importing any
 * entry point inert.
 *
 * `GITHUB_OUTPUT` and `GITHUB_STATE` go too: writing to a real runner file
 * during a local `act` session is not something a test should be able to do by
 * accident.
 */
export function setup(): void {
	delete process.env.GITHUB_ACTIONS;
	delete process.env.GITHUB_OUTPUT;
	delete process.env.GITHUB_STATE;
}
