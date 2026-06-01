import { api } from "./client";

export interface CompanySocialAccount {
  id: string;
  companyId: string;
  platformId: string;
  platformSlug: string;
  platformName: string;
  handle: string | null;
  displayName: string | null;
  profileUrl: string | null;
  platformAccountId: string | null;
  followerCount: number | null;
  avgEngagementRate: number | null;
  lastSyncedAt: string | null;
  defaultHashtags: string[] | null;
  defaultCta: string | null;
  timezone: string | null;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectAccountResult {
  authUrl: string;
}

export const socialAccountsApi = {
  list: (companyId: string) =>
    api.get<CompanySocialAccount[]>(`/companies/${companyId}/social-accounts`),

  connect: (companyId: string, platformSlug: string) =>
    api.post<ConnectAccountResult>(
      `/companies/${companyId}/social-accounts/connect/${platformSlug}`,
      {},
    ),

  disconnect: (companyId: string, id: string) =>
    api.delete<void>(`/companies/${companyId}/social-accounts/${id}`),

  sync: (companyId: string, id: string) =>
    api.post<CompanySocialAccount>(
      `/companies/${companyId}/social-accounts/${id}/sync`,
      {},
    ),
};
