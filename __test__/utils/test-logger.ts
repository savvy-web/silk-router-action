import { Layer, LogLevel, Logger } from "effect";

export interface TestLogEntry {
	level: string;
	message: string;
}

export class TestLogCollector {
	readonly entries: TestLogEntry[] = [];

	get messages(): string[] {
		return this.entries.map((e) => e.message);
	}

	clear(): void {
		this.entries.length = 0;
	}
}

/**
 * Creates a test logger layer that captures log entries into a collector
 * instead of writing to stdout. Use collector.messages to assert on logs.
 *
 * @example
 * ```ts
 * const logs = new TestLogCollector();
 * const layer = Layer.mergeAll(myServiceLayer, testLoggerLayer(logs));
 * await Effect.runPromise(program.pipe(Effect.provide(layer)));
 * expect(logs.messages).toContain("Phase: silk-branch");
 * ```
 */
export const testLoggerLayer = (collector: TestLogCollector) =>
	Layer.mergeAll(
		Logger.replace(
			Logger.defaultLogger,
			Logger.make(({ logLevel, message }) => {
				collector.entries.push({
					level: logLevel.label,
					message: typeof message === "string" ? message : JSON.stringify(message),
				});
			}),
		),
		Logger.minimumLogLevel(LogLevel.All),
	);

/**
 * A silent logger layer that suppresses all output.
 * Use when you don't need to inspect logs.
 */
export const silentLoggerLayer = Logger.minimumLogLevel(LogLevel.None);
