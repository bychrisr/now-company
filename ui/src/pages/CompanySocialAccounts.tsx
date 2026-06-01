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

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Nunca sincronizado";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Agora mesmo";
  if (minutes < 60) return `Há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Há ${days}d`;
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
}

function DisconnectDialog({ account, onConfirm, onCancel, isPending }: DisconnectDialogProps) {
  return (
    <Dialog open={!!account} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desconectar conta</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja desconectar{" "}
            <strong>{account?.handle ?? account?.displayName ?? account?.platformName}</strong>?
            <br />
            O token de acesso será revogado. Você poderá reconectar a qualquer momento.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Desconectando..." : "Desconectar"}
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
}

function ConnectedAccountCard({ account, onSync, onDisconnect, syncingId }: ConnectedAccountCardProps) {
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
                Reautenticação necessária
              </Badge>
            )}
          </div>
          {account.displayName && (
            <p className="text-xs text-muted-foreground mt-0.5">{account.displayName}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {formatFollowers(account.followerCount)} seguidores
            </span>
            <span className="text-xs text-muted-foreground">
              Engajamento: {formatEngagement(account.avgEngagementRate)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(account.lastSyncedAt)}
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
          title="Sincronizar agora"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          <span className="sr-only">Sincronizar</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDisconnect(account)}
          className="text-destructive hover:text-destructive"
          title="Desconectar"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Desconectar</span>
        </Button>
      </div>
    </div>
  );
}

interface AvailablePlatformCardProps {
  platform: SocialPlatform;
  onConnect: (slug: string) => void;
  isConnecting: boolean;
}

function AvailablePlatformCard({ platform, onConnect, isConnecting }: AvailablePlatformCardProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
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
      >
        {isConnecting ? "Aguarde..." : "Conectar"}
      </Button>
    </div>
  );
}

export function CompanySocialAccounts() {
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
      { label: "Company Settings", href: "/company/settings" },
      { label: "Redes Sociais" },
    ]);
  }, [setBreadcrumbs]);

  // Detecta retorno do OAuth callback
  useEffect(() => {
    const status = searchParams.get("status");
    const platform = searchParams.get("platform");
    if (status === "connected" && platform) {
      pushToast({
        title: "Conta conectada",
        body: `${platform} conectado com sucesso.`,
        tone: "success",
      });
      // Remove query params sem re-render desnecessário
      setSearchParams({}, { replace: true });
      queryClient.invalidateQueries({ queryKey: queryKeys.socialAccounts.list(selectedCompanyId!) });
    } else if (status === "error") {
      pushToast({
        title: "Erro ao conectar",
        body: "Não foi possível conectar a conta. Tente novamente.",
        tone: "error",
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, pushToast, queryClient, selectedCompanyId]);

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
      pushToast({ title: "Sincronizado", body: "Métricas atualizadas com sucesso.", tone: "success" });
    },
    onError: () => {
      pushToast({ title: "Erro ao sincronizar", body: "Não foi possível atualizar as métricas.", tone: "error" });
    },
    onSettled: () => setSyncingId(null),
  });

  const disconnectMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      socialAccountsApi.disconnect(selectedCompanyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.socialAccounts.list(selectedCompanyId!) });
      pushToast({ title: "Conta desconectada", body: "A conta foi removida com sucesso.", tone: "success" });
      setDisconnectTarget(null);
    },
    onError: () => {
      pushToast({ title: "Erro ao desconectar", body: "Não foi possível remover a conta.", tone: "error" });
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
      pushToast({ title: "Erro ao conectar", body: "Não foi possível iniciar a autenticação.", tone: "error" });
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
        <h1 className="text-xl font-semibold">Redes Sociais</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecte e gerencie as contas sociais da empresa.
        </p>
      </div>

      {/* Contas conectadas */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Contas conectadas</h2>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : accountsError ? (
          <p className="text-sm text-destructive">
            Erro ao carregar contas. Tente recarregar a página.
          </p>
        ) : connectedAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta conectada. Conecte uma conta abaixo.
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
              />
            ))}
          </div>
        )}
      </section>

      {/* Plataformas disponíveis para conectar */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Conectar nova conta</h2>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : availablePlatforms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todas as plataformas disponíveis já estão conectadas.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {availablePlatforms.map((platform) => (
              <AvailablePlatformCard
                key={platform.id}
                platform={platform}
                onConnect={(slug) => connectMutation.mutate({ slug })}
                isConnecting={connectingSlug === platform.slug}
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
      />
    </div>
  );
}
