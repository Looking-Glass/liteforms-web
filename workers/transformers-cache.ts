type TransformersEnvModule = {
  env?: {
    useBrowserCache?: boolean;
    useCustomCache?: boolean;
    customCache?: unknown;
    cacheKey?: string;
  };
};

type BrowserCacheLike = {
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response, progressCallback?: (progress: { loaded?: number; total?: number; progress?: number }) => void): Promise<void>;
};

type CacheProgress = {
  status?: string;
  progress?: number;
  file?: string;
  name?: string;
  message?: string;
};

type CacheProgressCallback = (progress: CacheProgress) => void;

const cacheNamespace = "liteforms-transformers-cache-v1";

export function configureTransformersBrowserCache(transformers: TransformersEnvModule, label: string, onProgress?: CacheProgressCallback) {
  const env = transformers.env;
  if (!env || typeof caches === "undefined") {
    onProgress?.({ status: "loading", progress: 0, message: `${label} browser cache unavailable` });
    return;
  }

  env.cacheKey = cacheNamespace;
  env.useBrowserCache = true;
  env.useCustomCache = true;
  env.customCache = createReportingCache(label, onProgress);
}

function createReportingCache(label: string, onProgress?: CacheProgressCallback): BrowserCacheLike {
  return {
    async match(request) {
      const cache = await caches.open(cacheNamespace);
      const response = await cache.match(request);
      // Per-file cache probes are not overall model load progress. Reporting 100 on
      // hits and 0 on misses made the UI jump to ~99% (cap), so only surface
      // a status message here.
      onProgress?.({
        status: "loading",
        message: response ? `${label} cache hit` : `${label} cache miss`
      });
      return response;
    },
    async put(request, response, progressCallback) {
      const cache = await caches.open(cacheNamespace);
      if (progressCallback) {
        await putWithProgress(cache, request, response, progressCallback);
        return;
      }
      await cache.put(request, response);
    }
  };
}

async function putWithProgress(
  cache: Cache,
  request: RequestInfo | URL,
  response: Response,
  progressCallback: (progress: { loaded?: number; total?: number; progress?: number }) => void
) {
  const body = response.body;
  if (!body) {
    await cache.put(request, response);
    return;
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? Number.parseInt(contentLength, 10) : undefined;
  let loaded = 0;
  const stream = new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          loaded += value.byteLength;
          const pct = total && total > 0 ? (loaded / total) * 100 : undefined;
          progressCallback({
            loaded,
            total,
            progress: pct
          });
          controller.enqueue(value);
        }
      } catch (caught) {
        controller.error(caught);
      }
    }
  });

  await cache.put(request, new Response(stream, response));
}
