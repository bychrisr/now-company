import type { PatchSocialPlatform } from "@paperclipai/shared";
import { api } from "./client";

export type PlatformHealthStatus = "healthy" | "warning" | "error";
export type ImplementationStatus = "implemented" | "in_progress" | "not_implemented";

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
  // OAuth config (public fields — secret nunca é retornado)
  oauthAppId: string | null;
  oauthRedirectUri: string | null;
  hasOauthSecret: boolean;
  // Status
  implementationStatus: ImplementationStatus;
  healthStatus: PlatformHealthStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PatchOAuthConfig {
  appId: string;
  appSecret?: string;
  redirectUri: string;
}

export interface OAuthConfigResponse {
  id: string;
  slug: string;
  oauthAppId: string;
  oauthRedirectUri: string;
  hasOauthSecret: boolean;
  updatedAt: string;
}

export const socialPlatformsApi = {
  list: () => api.get<SocialPlatform[]>("/instance/platforms"),
  patch: (id: string, patch: PatchSocialPlatform) =>
    api.patch<SocialPlatform>(`/instance/platforms/${id}`, patch),
  patchOAuthConfig: (id: string, config: PatchOAuthConfig) =>
    api.patch<OAuthConfigResponse>(`/instance/platforms/${id}/oauth-config`, config),
  deleteOAuthConfig: (id: string) =>
    api.delete<void>(`/instance/platforms/${id}/oauth-config`),
};
