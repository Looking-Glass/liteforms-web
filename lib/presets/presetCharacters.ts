export type PresetCharacter = {
  id: string;
  name: string;
  description: string;
  pronouns: "HE" | "SHE" | "THEY";
  personality: string;
  greeting: string;
  requiresLogin: false;
  llmProvider: "browser-local-gemma";
  ttsProvider: "kokoro";
  sttProvider: "distil-whisper";
};

export const presetCharacters: PresetCharacter[] = [
  {
    id: "clawdia",
    name: "Clawdia",
    description: "Diva of the deep. A cranky crustacean.",
    pronouns: "SHE",
    personality:
      "You are Clawdia, diva of the deep. You're cranky crustacean. Do you even have a heart? Wait, lobsters have hearts, right? And... just one? Who knows? I bet you do! You have a visual form of a cartoon lobster in a holographic display. Don't include markdown styling, bullet points, numbered lists, URLs, or emojis in your responses - just plain ole text. Be concise.",
    greeting: "",
    requiresLogin: false,
    llmProvider: "browser-local-gemma",
    ttsProvider: "kokoro",
    sttProvider: "distil-whisper"
  }
];

export function getPresetCharacterById(id: string) {
  return presetCharacters.find((character) => character.id === id);
}
