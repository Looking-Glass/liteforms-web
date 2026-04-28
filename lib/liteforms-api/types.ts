export type LiteformsVoice = {
  languageTag?: string;
  voiceName?: string;
  speakingStyle?: string;
  pitch?: string;
  rate?: string;
};

export type LiteformsCharacter = {
  id: number;
  name: string;
  description: string;
  pronouns: "HE" | "SHE" | "THEY";
  sceneId: string;
  voice: LiteformsVoice;
  avatar_id?: number;
  environmentID?: string;
};

export type LiteformsAccount = {
  id: string;
  email: string;
  displayName?: string;
  rpmId?: string;
  rpmToken?: string;
  liteformsCharacters?: LiteformsCharacter[];
  analytics?: {
    usage?: unknown;
  };
};

export type AnimationSetting = {
  name: string;
  frequency: number;
  intensity: number;
};

export type LiteformsModel = {
  id: number;
  name: string;
  url: string;
  model_type: "VRM" | "RPM" | string;
  upload_hash?: string;
  file_size?: number;
  scale?: number;
  armSpacing?: number;
  legSpacing?: number;
  rootHeight?: number;
  animations?: Record<string, AnimationSetting[]>;
};

export type CreateCharacterBody = Omit<LiteformsCharacter, "id">;
export type UpdateCharacterBody = Partial<CreateCharacterBody>;

export type CreateModelBody = Omit<LiteformsModel, "id">;
export type UpdateModelBody = Partial<CreateModelBody>;

export type ModelUploadRequest = {
  name: string;
  model_type: "VRM" | "RPM" | string;
  contentType: string;
  fileSize: number;
};

export type ModelUploadResponse = {
  uploadUrl: string;
  fields?: Record<string, string>;
  model?: LiteformsModel;
};
