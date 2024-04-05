import {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
} from "openai/resources/chat/completions"
import { ChatCompletionChunk } from "openai/resources/chat/completions"
import { Response, fetch } from "undici"
import { Stream } from "openai/streaming"
import { ILangtailExtraProps } from "./LangtailNode"
import { Fetch } from "openai/core"

export type Environment =
  | "preview"
  | "staging"
  | "production"
  | {
      name: string
      version: string
    }

interface LangtailPromptVariables {} // TODO use this when generating schema for deployed prompts

type StreamResponseType = Stream<ChatCompletionChunk>

type OpenAIResponseWithHttp = ChatCompletion & {
  httpResponse: Response | globalThis.Response
}

type Options = {
  apiKey: string
  baseURL?: string | undefined
  workspace?: string | undefined
  project?: string | undefined
  fetch?: Fetch
}

interface IRequestParams extends ILangtailExtraProps {
  prompt: string
  environment: Environment
  version?: string
  variables?: Record<string, any>
  messages?: ChatCompletionAssistantMessageParam[]
}

interface IRequestParamsStream extends IRequestParams {
  stream: boolean
}

export class LangtailCompletion {
  apiKey: string
  baseUrl: string
  options: Options

  constructor(options: Options) {
    const { apiKey, baseURL: baseUrl } = options
    this.apiKey = apiKey
    this.baseUrl = baseUrl ?? "https://api.langtail.com"
    this.options = options
  }

  createPromptPath({
    prompt,
    environment,
    version,
  }: {
    prompt: string
    environment: Environment
    version?: string
  }) {
    const envPath =
      typeof environment === "string"
        ? environment
        : `${environment.name}/${environment.version}`
    if (prompt.includes("/")) {
      throw new Error(
        "prompt should not include / character, either omit workspace/project or use just the prompt name.",
      )
    }
    const versionQueryParam = version ? `?=v${version}` : ""

    if (this.options.workspace && this.options.project) {
      const url = `${this.baseUrl}/${this.options.workspace}/${this.options.project}/${prompt}/${envPath}${versionQueryParam}`
      // user supplied workspace and project in constructor

      return url
    }

    if (this.options.project) {
      return `${this.options.project}/${prompt}/${envPath}/${versionQueryParam}`
    }

    const urlPath = `project-prompt/${prompt}/${envPath}`
    return urlPath.startsWith("/")
      ? this.baseUrl + urlPath + versionQueryParam
      : `${this.baseUrl}/${urlPath}${versionQueryParam}`
  }

  request(options: IRequestParams): Promise<OpenAIResponseWithHttp>

  request(options: IRequestParamsStream): Promise<StreamResponseType>
  async request({
    prompt,
    environment,
    doNotRecord,
    ...rest
  }: IRequestParams | IRequestParamsStream) {
    const fetchInit = {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "content-type": "application/json",
        "x-langtail-do-not-record": doNotRecord ? "true" : "false",
      },
      body: JSON.stringify({ stream: false, ...rest }),
    }
    const promptPath = this.createPromptPath({
      prompt,
      environment,
      version: rest.version,
    })

    let res: Response | globalThis.Response

    if (this.options.fetch) {
      res = await this.options.fetch(promptPath, fetchInit)
    } else {
      res = await fetch(promptPath, fetchInit)
    }

    if (!res.ok) {
      throw new Error(
        `Failed to fetch prompt: ${res.status} ${await res.text()}`,
      )
    }

    if ("stream" in rest && rest.stream) {
      if (!res.body) {
        throw new Error("No body in response")
      }
      // @ts-expect-error
      return Stream.fromSSEResponse(res, new AbortController())
    }

    const result = (await res.json()) as OpenAIResponseWithHttp
    result.httpResponse = res
    return result
  }
}
