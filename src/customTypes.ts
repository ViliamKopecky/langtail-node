// do not import from this file, import from ./types instead
// all types exported in this file can be overridden by user
// by redeclaring the langtail/dist/customTypes module

type LangtailEnvironment = "preview" | "staging" | "production";

export type PromptSlug = string;
export type Environment<P extends PromptSlug> = LangtailEnvironment | undefined
export type Version<P extends PromptSlug, E extends Environment<P>> = string | undefined;
