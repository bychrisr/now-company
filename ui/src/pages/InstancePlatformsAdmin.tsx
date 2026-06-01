import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Share2, Globe, Search, RefreshCw, AlertTriangle, Check } from "lucide-react";
import { socialPlatformsApi, type SocialPlatform } from "@/api/socialPlatforms";
import { accessApi } from "@/api/access";
import { queryKeys } from "@/lib/queryKeys";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { PlatformStatusDot } from "@/components/PlatformStatusDot";
import { PlatformImplementationBadge } from "@/components/PlatformImplementationBadge";
import { PlatformOAuthConfigCard } from "@/components/PlatformOAuthConfigCard";

export function InstancePlatformsAdmin() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [editingSortOrders, setEditingSortOrders] = useState<Record<string, number>>({});

  // Configura Breadcrumbs
  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings", href: "/instance/settings/general" },
      { label: "Platforms" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  // Query para verificar se o usuário atual é admin da instância
  const { data: boardAccess, isLoading: isAccessLoading } = useQuery({
    queryKey: queryKeys.access.currentBoardAccess,
    queryFn: () => accessApi.getCurrentBoardAccess(),
  });

  // Query para buscar as plataformas sociais da instância
  const { data: platforms, isLoading: isPlatformsLoading, error: platformsError } = useQuery({
    queryKey: ["instance", "platforms"],
    queryFn: () => socialPlatformsApi.list(),
    enabled: !!boardAccess?.isInstanceAdmin || boardAccess?.source === "local_implicit",
  });

  // Mutação para atualizar o status/sortOrder da plataforma
  const updatePlatformMutation = useMutation({
    mutationFn: ({ id, status, sortOrder }: { id: string; status?: "enabled" | "disabled"; sortOrder?: number }) =>
      socialPlatformsApi.patch(id, { status, sortOrder }),
    onSuccess: (updated) => {
      // Invalida cache e atualiza a UI
      queryClient.invalidateQueries({ queryKey: ["instance", "platforms"] });
      // Remove do estado temporário de edição caso tenha sido atualizado o sortOrder
      setEditingSortOrders((prev) => {
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
      pushToast({
        title: "Platform updated",
        body: `"${updated.name}" has been successfully updated.`,
        tone: "success",
      });
    },
    onError: (err: Error) => {
      pushToast({
        title: "Update failed",
        body: err.message,
        tone: "error",
      });
    },
  });

  if (isAccessLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading access settings...</div>;
  }

  const isInstanceAdmin = boardAccess?.isInstanceAdmin || boardAccess?.source === "local_implicit";

  // Se não for admin de instância, redireciona para as configurações gerais
  if (!isInstanceAdmin) {
    return <Navigate to="/instance/settings/general" replace />;
  }

  if (isPlatformsLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading platforms...</div>;
  }

  if (platformsError) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Failed to load social platforms</h2>
        </div>
        <p className="text-sm text-muted-foreground">{platformsError.message}</p>
      </div>
    );
  }

  // Filtragem de plataformas
  const filteredPlatforms = (platforms ?? []).filter((p) => {
    const term = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.slug.toLowerCase().includes(term) ||
      (p.category && p.category.toLowerCase().includes(term))
    );
  });

  const handleStatusToggle = (platform: SocialPlatform, checked: boolean) => {
    const newStatus = checked ? "enabled" : "disabled";
    updatePlatformMutation.mutate({
      id: platform.id,
      status: newStatus,
    });
  };

  const handleSortOrderChange = (platformId: string, value: string) => {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) {
      setEditingSortOrders((prev) => ({
        ...prev,
        [platformId]: parsed,
      }));
    }
  };

  const handleSaveSortOrder = (platform: SocialPlatform) => {
    const newOrder = editingSortOrders[platform.id];
    if (newOrder !== undefined && newOrder !== platform.sortOrder) {
      updatePlatformMutation.mutate({
        id: platform.id,
        sortOrder: newOrder,
      });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Social Platforms</h1>
          <Badge variant="outline" className="text-green-600 border-green-400">
            Admin
          </Badge>
        </div>
      </div>

      {/* Descrição */}
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
        <div className="flex items-start gap-3">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">Configure global social platforms</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Enable, disable, or prioritize the active platforms for social media posting across all client companies on this Paperclip instance.
            </p>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="flex items-center gap-3 bg-card p-3 rounded-lg border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, slug or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {searchQuery && (
          <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
            Clear
          </Button>
        )}
      </div>

      {/* Listagem */}
      {filteredPlatforms.length === 0 ? (
        <Card className="bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Share2 className="h-10 w-10 text-muted-foreground mb-3 opacity-60" />
            <p className="text-sm font-medium">No platforms found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your search criteria.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredPlatforms.map((platform) => {
            const currentSortOrder =
              editingSortOrders[platform.id] !== undefined
                ? editingSortOrders[platform.id]
                : platform.sortOrder;
            const isModified =
              editingSortOrders[platform.id] !== undefined &&
              editingSortOrders[platform.id] !== platform.sortOrder;
            const isMutating =
              updatePlatformMutation.isPending &&
              updatePlatformMutation.variables?.id === platform.id;

            return (
              <div
                key={platform.id}
                className={cn(
                  "rounded-lg border bg-card px-4 py-3 transition-colors",
                  platform.status === "disabled" && "opacity-75",
                )}
              >
                {/* Linha principal */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Ícone + nome + badges */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {platform.iconUrl ? (
                      <img
                        src={platform.iconUrl}
                        alt={platform.name}
                        className="h-6 w-6 object-contain rounded shrink-0"
                      />
                    ) : (
                      <div className="h-6 w-6 bg-muted rounded flex items-center justify-center shrink-0">
                        <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <PlatformStatusDot status={platform.healthStatus} />
                    <span className="font-medium text-foreground">{platform.name}</span>
                    <PlatformImplementationBadge status={platform.implementationStatus} />
                    <Badge variant="secondary" className="capitalize text-xs hidden sm:inline-flex">
                      {platform.category}
                    </Badge>
                  </div>

                  {/* Controles */}
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Sort order */}
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        value={currentSortOrder}
                        onChange={(e) => handleSortOrderChange(platform.id, e.target.value)}
                        className="w-16 text-right h-8 text-xs"
                        disabled={isMutating}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveSortOrder(platform);
                        }}
                      />
                      {isModified && (
                        <Button
                          size="icon-sm"
                          variant="outline"
                          className="h-8 w-8 text-green-600 border-green-400 hover:bg-green-50"
                          onClick={() => handleSaveSortOrder(platform)}
                          disabled={isMutating}
                          title="Save sort order"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Enable/disable toggle */}
                    <div className="flex items-center gap-1.5">
                      <ToggleSwitch
                        checked={platform.status === "enabled"}
                        onCheckedChange={(checked) => handleStatusToggle(platform, checked)}
                        disabled={isMutating}
                      />
                      <span
                        className={cn(
                          "text-xs font-medium w-14",
                          platform.status === "enabled" ? "text-green-600" : "text-muted-foreground",
                        )}
                      >
                        {platform.status === "enabled" ? "Enabled" : "Disabled"}
                      </span>
                      {isMutating && (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Card colapsável de configuração OAuth */}
                <PlatformOAuthConfigCard platform={platform} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
