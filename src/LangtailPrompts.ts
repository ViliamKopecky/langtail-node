import {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
} from "openai/resources/chat/completions"
import { ChatCompletionChunk } from "openai/resources/chat/completions"

import { Stream } from "openai/streaming"
import { ILangtailExtraProps } from "./LangtailNode"
import { Fetch } from "openai/core"
import { userAgent } from "./userAgent"
import queryString from "query-string"
import { PlaygroundState } from "./schemas"
import { OpenAiBodyType, getOpenAIBody } from "./getOpenAIBody"

export type LangtailEnvironment = "preview" | "staging" | "production"

interface LangtailPromptVariables { } // TODO use this when generating schema for deployed prompts

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
  onResponse?: (response: ChatCompletion) => void
}

interface IPromptIdProps extends ILangtailExtraProps, OpenAiBodyType {
  prompt: string
  /**
   * The environment to fetch the prompt from. Defaults to "production".
   * @default "production"
   **/
  environment?: LangtailEnvironment
  version?: string
}

export interface IRequestParams extends IPromptIdProps {
  variables?: Record<string, any>
}

interface IRequestParamsStream extends IRequestParams {
  stream: boolean
}

export class LangtailPrompts {
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
    configGet,
  }: {
    prompt: string
    environment: LangtailEnvironment
    version?: string
    configGet?: boolean
  }) {
    if (prompt.includes("/")) {
      throw new Error(
        "prompt should not include / character, either omit workspace/project or use just the prompt name.",
      )
    }
    const queryParams = queryString.stringify({
      v: version,
      "open-ai-completion-config-payload": configGet,
    })
    const queryParamsString = queryParams ? `?${queryParams}` : ""

    if (this.options.workspace && this.options.project) {
      const url = `${this.baseUrl}/${this.options.workspace}/${this.options.project}/${prompt}/${environment}?${queryParams}`
      // user supplied workspace and project in constructor

      return url
    }

    if (this.options.project) {
      return `${this.options.project}/${prompt}/${environment}${queryParamsString}`
    }

    const urlPath = `project-prompt/${prompt}/${environment}`
    return urlPath.startsWith("/")
      ? this.baseUrl + urlPath + `${queryParamsString}`
      : `${this.baseUrl}/${urlPath}${queryParamsString}`
  }

  invoke(
    options: Omit<IRequestParams, "stream">,
  ): Promise<OpenAIResponseWithHttp>
  invoke(options: IRequestParamsStream): Promise<StreamResponseType>
  async invoke({
    prompt,
    environment,
    version,
    doNotRecord,
    metadata,
    ...rest
  }: IRequestParams | IRequestParamsStream) {
    const metadataHeaders = metadata
      ? Object.entries(metadata).reduce((acc, [key, value]) => {
        acc[`x-langtail-metadata-${key}`] = value
        return acc
      }, {})
      : {}

    const fetchInit = {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "user-agent": userAgent,
        "content-type": "application/json",
        "x-langtail-do-not-record": doNotRecord ? "true" : "false",
        ...metadataHeaders,
      },
      body: JSON.stringify({ stream: false, ...rest }),
    }
    const promptPath = this.createPromptPath({
      prompt,
      environment: environment ?? "production",
      version: version,
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
      return Stream.fromSSEResponse(res, new AbortController())
    }

    const result = (await res.json()) as OpenAIResponseWithHttp
    if (this.options.onResponse) {
      this.options.onResponse(result)
    }
    result.httpResponse = res
    return result
  }

  async get({
    prompt,
    environment,
    version,
  }: {
    prompt: string
    /**
     * The environment to fetch the prompt from. Defaults to "production".
     * @default "production"
     **/
    environment?: LangtailEnvironment
    version?: string
  }): Promise<PlaygroundState> {
    const promptPath = this.createPromptPath({
      prompt,
      environment: environment ?? "production",
      version,
    })

    const res = await fetch(promptPath, {
      headers: {
        "X-API-Key": this.apiKey,
        "user-agent": userAgent,
        "content-type": "application/json",
      },
    })

    if (!res.ok) {
      throw new Error(
        `Failed to fetch prompt config payload: ${res.status} ${await res.text()}`,
      )
    }

    return res.json()
  }

  build(completionConfig: PlaygroundState, parsedBody: OpenAiBodyType) {
    return getOpenAIBody(completionConfig, parsedBody)
  }
}
