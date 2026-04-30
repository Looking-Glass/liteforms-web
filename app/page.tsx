"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarScene } from "@/components/avatar/AvatarScene";
import { ChatPanel, initialLocalModelLoadState } from "@/components/chat/ChatPanel";
import type { CharacterConfig, LocalModelLoadState } from "@/components/chat/ChatPanel";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import type { BaseProviderConfig } from "@/lib/llm";
import type { AsrConfig, TtsConfig } from "@/lib/speech";
import { saveSessionConfig, loadSessionConfig } from "@/lib/storage/sessionConfig";
import { saveCharacterConfig, loadCharacterConfig } from "@/lib/storage/characterConfig";
import { createIndexedDbVrmRepository } from "@/lib/storage/indexedDbVrmRepository";
import type { VrmRepository } from "@/lib/storage/vrmRepository";

const onboardingStorageKey = "liteforms.onboardingMode";

const defaultCharacter: CharacterConfig = {
  name: "Clawdia",
  pronouns: "SHE",
  personality: "You are Clawdia, queen of the deep. You're cranky crustacean, but under that hard exoskeleton, you have a big heart. Wait, lobsters have hearts, right? And... just one? Who knows? I bet you do! You have a visual form of a cartoon lobster in a holographic display. Don't include markdown styling, bullet points, numbered lists, URLs, or emojis in your responses - just plain ole text. Be concise.",
  greeting: ""
};

export default function HomePage() {
  const [modelUrl, setModelUrl] = useState<string | undefined>(undefined);
  const [restoredVrmFileName, setRestoredVrmFileName] = useState<string | undefined>(undefined);
  const vrmRepoRef = useRef<VrmRepository | null>(null);
  const [character, setCharacter] = useState<CharacterConfig>(() => {
    const saved = loadCharacterConfig();
    if (!saved) return defaultCharacter;
    return { name: saved.name, pronouns: saved.pronouns, personality: saved.personality, greeting: saved.greeting };
  });
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
    } else if (savedMode === "custom") {
      const saved = loadSessionConfig();
      if (saved) {
        setInitialLlmConfig(saved.llm);
        setInitialTtsConfig(saved.tts);
        setInitialAsrConfig(saved.asr);
        // React 18 batches these updates, so ChatPanel re-mounts in a single
        // re-render with the correct initialConfig — avoiding the two-render
        // cycle where ChatPanel's own useState would ignore an updated prop.
        setChatPanelKey((k) => k + 1);
      }
      setShouldPreloadLocalModels(true);
    }

    createIndexedDbVrmRepository().then((repo) => {
      vrmRepoRef.current = repo;
      return repo.load();
    }).then((stored) => {
      if (!stored) return;
      const blob = new Blob([stored.arrayBuffer]);
      setModelUrl(URL.createObjectURL(blob));
      setRestoredVrmFileName(stored.fileName);
    }).catch(() => {
      // IndexedDB may be unavailable (private browsing, storage quota, etc.)
    });
  }, []);

  const handleLocalModelLoadStateChange = useCallback((state: LocalModelLoadState[]) => {
    setModalLoadState(state);
  }, []);

  const handleConfigChange = useCallback((llm: BaseProviderConfig, tts: TtsConfig, asr: AsrConfig) => {
    // Persist mid-session settings changes so they survive a page refresh.
    const savedMode = localStorage.getItem(onboardingStorageKey);
    if (savedMode === "custom") {
      saveSessionConfig({ llm, tts, asr });
    }
  }, []);

  const handleCharacterChange = useCallback((next: CharacterConfig) => {
    setCharacter(next);
    saveCharacterConfig(next);
  }, []);

  const handleVrmFileLoad = useCallback((file: File) => {
    file.arrayBuffer().then((buf) => {
      vrmRepoRef.current?.save(buf, file.name).catch(() => {
        // Storage failure is non-fatal; the VRM is still loaded for this session.
      });
    }).catch(() => {});
  }, []);

  const handleVrmReset = useCallback(() => {
    setModelUrl(undefined);
    setRestoredVrmFileName(undefined);
    vrmRepoRef.current?.clear().catch(() => {});
  }, []);

  function handleUseBuiltIn() {
    localStorage.setItem(onboardingStorageKey, "builtin");
    setShouldPreloadLocalModels(true);
    // Modal stays open to show the loading step — closed by handleModalClose
  }

  function handleUseCustom(config: BaseProviderConfig, ttsConfig: TtsConfig, asrConfig: AsrConfig) {
    localStorage.setItem(onboardingStorageKey, "custom");
    saveSessionConfig({ llm: config, tts: ttsConfig, asr: asrConfig });
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
        onCharacterChange={handleCharacterChange}
        onModelUrlChange={setModelUrl}
        initialVrmFileName={restoredVrmFileName}
        onVrmFileLoad={handleVrmFileLoad}
        onVrmReset={handleVrmReset}
        shouldPreloadLocalModels={shouldPreloadLocalModels}
        preloadSessionId={chatPanelKey}
        initialLlmConfig={initialLlmConfig}
        initialTtsConfig={initialTtsConfig}
        initialAsrConfig={initialAsrConfig}
        onLocalModelLoadStateChange={handleLocalModelLoadStateChange}
        onConfigChange={handleConfigChange}
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
