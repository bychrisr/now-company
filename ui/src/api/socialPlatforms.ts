import type { PatchSocialPlatform } from "@paperclipai/shared";
import { api } from "./client";

export interface SocialPlatform {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: "enabled" | "disabled";
  sortOrder: number;
  capabilities: Record<string, unknown>;
  copySpecs: Record<string, unknown>;
  imageSpecs: Record<string, unknown>;
  iconUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export const socialPlatformsApi = {
  list: () => api.get<SocialPlatform[]>("/instance/platforms"),
  patch: (id: string, patch: PatchSocialPlatform) =>
    api.patch<SocialPlatform>(`/instance/platforms/${id}`, patch),
};
