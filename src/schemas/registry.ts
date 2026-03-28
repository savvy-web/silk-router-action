import { Schema } from "effect";

export const NpmParams = Schema.Struct({
	registry: Schema.String.pipe(Schema.minLength(1)),
	provenance: Schema.Boolean,
}).annotations({ identifier: "NpmParams" });

export const JsrParams = Schema.Struct({}).annotations({ identifier: "JsrParams" });

export const RegistryProtocol = Schema.Literal("npm", "jsr").annotations({ identifier: "RegistryProtocol" });

export type RegistryProtocolType = typeof RegistryProtocol.Type;

export const Registry = Schema.Struct({
	id: Schema.String.pipe(Schema.minLength(1)),
	name: Schema.String.pipe(Schema.minLength(1)),
	protocol: RegistryProtocol,
	params: Schema.Union(NpmParams, JsrParams),
	artifacts: Schema.Array(Schema.Unknown),
}).annotations({ identifier: "Registry" });

export type RegistryType = typeof Registry.Type;

export const RegistryTarget = Schema.Struct({
	as: Schema.String.pipe(Schema.minLength(1)),
	source: Schema.String,
	registry: Registry,
}).annotations({ identifier: "RegistryTarget" });

export type RegistryTargetType = typeof RegistryTarget.Type;
