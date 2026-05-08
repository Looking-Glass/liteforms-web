import type { OpenAiCodexDeviceCredential, OpenAiCodexDevicePending } from "./openAiCodexDeviceAuth";

type OpenAiCodexAuthStore = {
  pending?: OpenAiCodexDevicePending;
  credential?: OpenAiCodexDeviceCredential;
};

const openAiCodexStore = globalThis as typeof globalThis & {
  __liteformsOpenAiCodexAuth?: OpenAiCodexAuthStore;
};

export function getOpenAiCodexAuthStore() {
  openAiCodexStore.__liteformsOpenAiCodexAuth ??= {};
  return openAiCodexStore.__liteformsOpenAiCodexAuth;
}

export function getOpenAiCodexAccessToken() {
  const credential = getOpenAiCodexAuthStore().credential;
  return credential && credential.expires > Date.now() ? credential.access : undefined;
}

export function setOpenAiCodexCredential(credential: OpenAiCodexDeviceCredential) {
  getOpenAiCodexAuthStore().credential = credential;
}
