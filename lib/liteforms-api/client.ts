import type {
  CreateCharacterBody,
  CreateModelBody,
  LiteformsAccount,
  LiteformsCharacter,
  LiteformsModel,
  ModelUploadRequest,
  ModelUploadResponse,
  UpdateCharacterBody,
  UpdateModelBody
} from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type LiteformsApiClientOptions = {
  baseUrl: string;
  accessToken: string;
  fetch?: FetchLike;
};

export class LiteformsApiClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: LiteformsApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetch ?? fetch;
  }

  getAccountUsage() {
    return this.request<LiteformsAccount>("/api/liteforms/usage");
  }

  getCharacters() {
    return this.request<LiteformsCharacter[]>("/api/characters");
  }

  createCharacter(body: CreateCharacterBody) {
    return this.request<LiteformsCharacter>("/api/characters", { method: "POST", body });
  }

  updateCharacter(id: number | string, body: UpdateCharacterBody) {
    return this.request<LiteformsCharacter>(`/api/characters/${id}`, { method: "PATCH", body });
  }

  deleteCharacter(id: number | string) {
    return this.request<{ ok: true }>(`/api/characters/${id}`, { method: "DELETE" });
  }

  createModel(body: CreateModelBody) {
    return this.request<LiteformsModel>("/api/models", { method: "POST", body });
  }

  readModel(id: number | string) {
    return this.request<LiteformsModel>(`/api/models/${id}`);
  }

  updateModel(id: number | string, body: UpdateModelBody) {
    return this.request<LiteformsModel>(`/api/models/${id}`, { method: "PATCH", body });
  }

  deleteModel(id: number | string) {
    return this.request<{ ok: true }>(`/api/models/${id}`, { method: "DELETE" });
  }

  requestModelUpload(body: ModelUploadRequest) {
    return this.request<ModelUploadResponse>("/api/models/upload", { method: "POST", body });
  }

  updateUserRpmId(body: { id: string; token: string }) {
    return this.request<LiteformsAccount>("/api/user/rpm", { method: "POST", body });
  }

  private async request<T>(path: string, options: { method?: string; body?: unknown } = {}) {
    const init: RequestInit = {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json"
      }
    };

    if (options.method) {
      init.method = options.method;
    }

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);

    if (!response.ok) {
      throw new LiteformsApiError(response.status, await response.text());
    }

    return (await response.json()) as T;
  }
}

export class LiteformsApiError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string
  ) {
    super(`Liteforms API request failed with status ${status}`);
  }
}
