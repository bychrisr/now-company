import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "@/lib/router";
import {
  AlertCircle,
  Globe,
  RefreshCw,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { socialAccountsApi, type CompanySocialAccount } from "@/api/social-accounts";
import { socialPlatformsApi, type SocialPlatform } from "@/api/socialPlatforms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { useTranslation } from "@/i18n";

type TFunc = ReturnType<typeof useTranslation>["t"];

function formatRelativeTime(dateStr: string | null, t: TFunc, ns: string): string {
  if (!dateStr) return t(`${ns}.neverSynced`);
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t(`${ns}.justNow`);
  if (minutes < 60) return t(`${ns}.minutesAgo`, { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(`${ns}.hoursAgo`, { hours });
  const days = Math.floor(hours / 24);
  return t(`${ns}.daysAgo`, { days });
}

function formatFollowers(count: number | null): string {
  if (count == null) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatEngagement(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(2)}%`;
}

interface DisconnectDialogProps {
  account: CompanySocialAccount | null;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  t: TFunc;
  ns: string;
}

function DisconnectDialog({ account, onConfirm, onCancel, isPending, t, ns }: DisconnectDialogProps) {
  const handle = account?.handle ?? account?.displayName ?? account?.platformName ?? "";
  return (
    <Dialog open={!!account} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`${ns}.disconnect.title`)}</DialogTitle>
          <DialogDescription>
            {t(`${ns}.disconnect.description`, { handle })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            {t(`${ns}.disconnect.cancel`)}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? t(`${ns}.disconnect.confirming`) : t(`${ns}.disconnect.confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConnectedAccountCardProps {
  account: CompanySocialAccount;
  onSync: (id: string) => void;
  onDisconnect: (account: CompanySocialAccount) => void;
  syncingId: string | null;
  t: TFunc;
  ns: string;
}

function ConnectedAccountCard({ account, onSync, onDisconnect, syncingId, t, ns }: ConnectedAccountCardProps) {
  const isSyncing = syncingId === account.id;
  const needsReauth = account.needsReauth === true;

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Share2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{account.platformName}</span>
            {account.handle && (
              <span className="text-sm text-muted-foreground">@{account.handle}</span>
            )}
            {needsReauth && (
              <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                <AlertCircle className="h-3 w-3" />
                {t(`${ns}.needsReauth`)}
              </Badge>
            )}
          </div>
          {account.displayName && (
            <p className="text-xs text-muted-foreground mt-0.5">{account.displayName}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {t(`${ns}.followers`, { count: formatFollowers(account.followerCount) })}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(`${ns}.engagement`)} {formatEngagement(account.avgEngagementRate)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(account.lastSyncedAt, t, ns)}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSync(account.id)}
          disabled={isSyncing}
          title={t(`${ns}.syncNow`)}
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          <span className="sr-only">{t(`${ns}.syncAriaLabel`)}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDisconnect(account)}
          className="text-destructive hover:text-destructive"
          title={t(`${ns}.disconnectAriaLabel`)}
          data-testid={`disconnect-${account.id}`}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">{t(`${ns}.disconnectAriaLabel`)}</span>
        </Button>
      </div>
    </div>
  );
}

interface AvailablePlatformCardProps {
  platform: SocialPlatform;
  onConnect: (slug: string) => void;
  isConnecting: boolean;
  t: TFunc;
  ns: string;
}

function AvailablePlatformCard({ platform, onConnect, isConnecting, t, ns }: AvailablePlatformCardProps) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
      data-platform-slug={platform.slug}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Globe className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-sm">{platform.name}</p>
          {platform.description && (
            <p className="text-xs text-muted-foreground">{platform.description}</p>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onConnect(platform.slug)}
        disabled={isConnecting}
        data-testid={`connect-${platform.slug}`}
        data-connect-slug={platform.slug}
      >
        {isConnecting ? t(`${ns}.connecting`) : t(`${ns}.connect`)}
      </Button>
    </div>
  );
}

export function CompanySocialAccounts() {
  const { t } = useTranslation();
  const ns = "pages.companySettings.socialAccounts";
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [disconnectTarget, setDisconnectTarget] = useState<CompanySocialAccount | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("pages.companySettings.title"), href: "/company/settings" },
      { label: t(`${ns}.breadcrumb`) },
    ]);
  }, [setBreadcrumbs, t, ns]);

  useEffect(() => {
    const status = searchParams.get("status");
    const platform = searchParams.get("platform");
    if (status === "connected" && platform) {
      pushToast({
        title: t(`${ns}.toast.connected.title`),
        body: t(`${ns}.toast.connected.body`, { platform }),
        tone: "success",
      });
      setSearchParams({}, { replace: true });
      queryClient.invalidateQueries({ queryKey: queryKeys.socialAccounts.list(selectedCompanyId!) });
    } else if (status === "error") {
      pushToast({
        title: t(`${ns}.toast.authError.title`),
        body: t(`${ns}.toast.authError.body`),
        tone: "error",
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, pushToast, queryClient, selectedCompanyId, t, ns]);

  const {
    data: accounts,
    isLoading: accountsLoading,
    isError: accountsError,
  } = useQuery({
    queryKey: queryKeys.socialAccounts.list(selectedCompanyId!),
    queryFn: () => socialAccountsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: allPlatforms, isLoading: platformsLoading } = useQuery({
    queryKey: ["social-platforms"],
    queryFn: () => socialPlatformsApi.list(),
  });

  const syncMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      socialAccountsApi.sync(selectedCompanyId!, id),
    onMutate: ({ id }) => setSyncingId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.socialAccounts.list(selectedCompanyId!) });
      pushToast({ title: t(`${ns}.toast.synced.title`), body: t(`${ns}.toast.synced.body`), tone: "success" });
    },
    onError: () => {
      pushToast({ title: t(`${ns}.toast.syncError.title`), body: t(`${ns}.toast.syncError.body`), tone: "error" });
    },
    onSettled: () => setSyncingId(null),
  });

  const disconnectMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      socialAccountsApi.disconnect(selectedCompanyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.socialAccounts.list(selectedCompanyId!) });
      pushToast({ title: t(`${ns}.toast.disconnected.title`), body: t(`${ns}.toast.disconnected.body`), tone: "success" });
      setDisconnectTarget(null);
    },
    onError: () => {
      pushToast({ title: t(`${ns}.toast.disconnectError.title`), body: t(`${ns}.toast.disconnectError.body`), tone: "error" });
    },
  });

  const connectMutation = useMutation({
    mutationFn: ({ slug }: { slug: string }) =>
      socialAccountsApi.connect(selectedCompanyId!, slug),
    onMutate: ({ slug }) => setConnectingSlug(slug),
    onSuccess: ({ authUrl }) => {
      window.location.href = authUrl;
    },
    onError: () => {
      setConnectingSlug(null);
      pushToast({ title: t(`${ns}.toast.connectError.title`), body: t(`${ns}.toast.connectError.body`), tone: "error" });
    },
  });

  const connectedAccounts = accounts?.filter((a) => a.isActive) ?? [];
  const connectedPlatformSlugs = new Set(connectedAccounts.map((a) => a.platformSlug));
  const availablePlatforms = allPlatforms?.filter(
    (p) => p.status === "enabled" && !connectedPlatformSlugs.has(p.slug),
  ) ?? [];

  const isLoading = accountsLoading || platformsLoading;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">{t(`${ns}.title`)}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t(`${ns}.description`)}
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold mb-3">{t(`${ns}.connectedAccountsTitle`)}</h2>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : accountsError ? (
          <p className="text-sm text-destructive">
            {t(`${ns}.loadError`)}
          </p>
        ) : connectedAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(`${ns}.noAccountsConnected`)}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {connectedAccounts.map((account) => (
              <ConnectedAccountCard
                key={account.id}
                account={account}
                onSync={(id) => syncMutation.mutate({ id })}
                onDisconnect={setDisconnectTarget}
                syncingId={syncingId}
                t={t}
                ns={ns}
              />
            ))}
          </div>
        )}
      </section>

      <section data-testid="available-platforms">
        <h2 className="text-sm font-semibold mb-3">{t(`${ns}.connectNewAccountTitle`)}</h2>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : availablePlatforms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(`${ns}.allPlatformsConnected`)}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {availablePlatforms.map((platform) => (
              <AvailablePlatformCard
                key={platform.id}
                platform={platform}
                onConnect={(slug) => connectMutation.mutate({ slug })}
                isConnecting={connectingSlug === platform.slug}
                t={t}
                ns={ns}
              />
            ))}
          </div>
        )}
      </section>

      <DisconnectDialog
        account={disconnectTarget}
        onConfirm={() => {
          if (disconnectTarget) disconnectMutation.mutate({ id: disconnectTarget.id });
        }}
        onCancel={() => setDisconnectTarget(null)}
        isPending={disconnectMutation.isPending}
        t={t}
        ns={ns}
      />
    </div>
  );
}
