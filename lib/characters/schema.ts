import { z } from "zod";

export const voiceSchema = z
  .object({
    languageTag: z.string().optional(),
    voiceName: z.string().optional(),
    speakingStyle: z.string().optional(),
    pitch: z.string().optional(),
    rate: z.string().optional()
  })
  .strict();

export const characterInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(4000),
    pronouns: z.enum(["HE", "SHE", "THEY"]),
    sceneId: z.string().trim().optional().default("default"),
    voice: voiceSchema.default({}),
    avatar_id: z.number().int().positive().optional(),
    environmentID: z.string().trim().optional()
  })
  .strict();

export const characterUpdateSchema = characterInputSchema.partial().strict();

export type CharacterInput = z.infer<typeof characterInputSchema>;
export type CharacterUpdate = z.infer<typeof characterUpdateSchema>;

export function normalizeCharacterInput(input: unknown): CharacterInput {
  const parsed = characterInputSchema.parse(input);

  return {
    ...parsed,
    sceneId: parsed.sceneId || "default"
  };
}

export function normalizeCharacterUpdate(input: unknown): CharacterUpdate {
  const parsed = characterUpdateSchema.parse(input);

  if (parsed.sceneId !== undefined && parsed.sceneId.trim() === "") {
    return { ...parsed, sceneId: "default" };
  }

  return parsed;
}
