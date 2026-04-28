import type { RmsLipSyncFrame, VisemeFrame } from "@/lib/speech";

export const avatarLipSyncEventName = "liteforms:avatar-lip-sync";

export type AvatarLipSyncFrame = VisemeFrame | RmsLipSyncFrame;

export function dispatchAvatarLipSyncFrame(frame: AvatarLipSyncFrame, target: Window = window) {
  target.dispatchEvent(new CustomEvent<AvatarLipSyncFrame>(avatarLipSyncEventName, { detail: frame }));
}
