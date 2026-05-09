import * as Schema from 'effect/Schema';

export class PatternLoadError extends Schema.TaggedErrorClass<PatternLoadError>()(
	'PatternLoadError',
	{
		path: Schema.String,
		message: Schema.String,
	},
) {}

export class FrontmatterParseError extends Schema.TaggedErrorClass<FrontmatterParseError>()(
	'FrontmatterParseError',
	{
		path: Schema.String,
		message: Schema.String,
	},
) {}

export class FileReadError extends Schema.TaggedErrorClass<FileReadError>()(
	'FileReadError',
	{
		path: Schema.String,
		message: Schema.String,
	},
) {}

export class MatchError extends Schema.TaggedErrorClass<MatchError>()(
	'MatchError',
	{
		path: Schema.String,
		patternName: Schema.String,
		message: Schema.String,
	},
) {}
