import * as Schema from 'effect/Schema';

export class WalkError extends Schema.TaggedErrorClass<WalkError>()(
	'WalkError',
	{
		path: Schema.String,
		message: Schema.String,
	},
) {}

export class GitTrackedListFailed extends Schema.TaggedErrorClass<GitTrackedListFailed>()(
	'GitTrackedListFailed',
	{
		message: Schema.String,
	},
) {}

export class AuditFailed extends Schema.TaggedErrorClass<AuditFailed>()(
	'AuditFailed',
	{
		matchCount: Schema.Int,
		threshold: Schema.String,
		message: Schema.String,
	},
) {}
