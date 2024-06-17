import { ILangtailExtraProps } from '../LangtailNode';
import { PromptSlug, Environment, Version, IsProductionDefined, LangtailEnvironment } from '../types';
import { OpenAiBodyType } from '../getOpenAIBody';


type LangtailChatSettingsBase<P extends PromptSlug, E extends Environment<P> = undefined, V extends Version<P, E> = undefined> = IsProductionDefined<P> extends true ? {
  environment?: E,
  version?: V
} : (E extends undefined ? {
  environment: E & LangtailEnvironment,
  version?: V
} : {
  environment: E,
  version?: V
});

export type LangtailChatSettings<P extends PromptSlug, E extends Environment<P> = undefined, V extends Version<P, E> = undefined> = LangtailChatSettingsBase<P, E, V> & ILangtailExtraProps & OpenAiBodyType & {
  variables?: Record<string, any>
}