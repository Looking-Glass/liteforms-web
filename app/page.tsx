"use client";

import { useCallback, useEffect, useState } from "react";
import { AvatarScene } from "@/components/avatar/AvatarScene";
import { ChatPanel, initialLocalModelLoadState } from "@/components/chat/ChatPanel";
import type { CharacterConfig, LocalModelLoadState } from "@/components/chat/ChatPanel";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import type { BaseProviderConfig } from "@/lib/llm";
import type { AsrConfig, TtsConfig } from "@/lib/speech";

const onboardingStorageKey = "liteforms.onboardingMode";

const defaultCharacter: CharacterConfig = {
  name: "Andi",
  pronouns: "THEY",
  personality: "You are Andi, a warm but concise avatar companion. Keep answers practical and conversational.",
  greeting: "Hi, I am Andi. What should we work through first?"
};

export default function HomePage() {
  const [modelUrl, setModelUrl] = useState<string | undefined>(undefined);
  const [character, setCharacter] = useState<CharacterConfig>(defaultCharacter);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [shouldPreloadLocalModels, setShouldPreloadLocalModels] = useState(false);
  const [initialLlmConfig, setInitialLlmConfig] = useState<BaseProviderConfig | undefined>(undefined);
  const [initialTtsConfig, setInitialTtsConfig] = useState<TtsConfig | undefined>(undefined);
  const [initialAsrConfig, setInitialAsrConfig] = useState<AsrConfig | undefined>(undefined);
  const [chatPanelKey, setChatPanelKey] = useState(0);
  const [modalLoadState, setModalLoadState] = useState<LocalModelLoadState[]>(initialLocalModelLoadState);

  useEffect(() => {
    const savedMode = localStorage.getItem(onboardingStorageKey);
    if (!savedMode) {
      setShowOnboarding(true);
    } else if (savedMode === "builtin") {
      setShouldPreloadLocalModels(true);
    }
  }, []);

  const handleLocalModelLoadStateChange = useCallback((state: LocalModelLoadState[]) => {
    setModalLoadState(state);
  }, []);

  function handleUseBuiltIn() {
    localStorage.setItem(onboardingStorageKey, "builtin");
    setShouldPreloadLocalModels(true);
    // Modal stays open to show the loading step — closed by handleModalClose
  }

  function handleUseCustom(config: BaseProviderConfig, ttsConfig: TtsConfig, asrConfig: AsrConfig) {
    localStorage.setItem(onboardingStorageKey, "custom");
    setInitialLlmConfig(config);
    setInitialTtsConfig(ttsConfig);
    setInitialAsrConfig(asrConfig);
    // Trigger preloading; ChatPanel's runPreload decides per-model whether to actually download.
    setShouldPreloadLocalModels(true);
    // The modal stays open and transitions itself to the "loading" step (handleCustomStart inside
    // OnboardingModal). The user closes it via the "Continue" button when models are ready, which
    // calls handleModalClose. This matches the built-in flow.
    setChatPanelKey((k) => k + 1);
  }

  function handleModalClose() {
    setShowOnboarding(false);
  }

  return (
    <main className="stage">
      <section className="avatar-viewport" aria-label="Avatar preview">
        <AvatarScene modelUrl={modelUrl} />
      </section>
      <ChatPanel
        key={chatPanelKey}
        character={character}
        onCharacterChange={setCharacter}
        onModelUrlChange={setModelUrl}
        shouldPreloadLocalModels={shouldPreloadLocalModels}
        preloadSessionId={chatPanelKey}
        initialLlmConfig={initialLlmConfig}
        initialTtsConfig={initialTtsConfig}
        initialAsrConfig={initialAsrConfig}
        onLocalModelLoadStateChange={handleLocalModelLoadStateChange}
      />
      {showOnboarding && (
        <OnboardingModal
          onUseBuiltIn={handleUseBuiltIn}
          onUseCustom={handleUseCustom}
          onClose={handleModalClose}
          localModelLoadState={modalLoadState}
        />
      )}
    </main>
  );
}
