import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { socialPlatformsApi, type SocialPlatform } from "@/api/socialPlatforms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";
import { oauthHelpBySlug } from "@/lib/platform-oauth-help";
import { cn } from "@/lib/utils";

interface Props {
  platform: SocialPlatform;
}

export function PlatformOAuthConfigCard({ platform }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [appId, setAppId] = useState(platform.oauthAppId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(platform.oauthRedirectUri ?? "");
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () =>
      socialPlatformsApi.patchOAuthConfig(platform.id, {
        appId,
        ...(appSecret ? { appSecret } : {}),
        redirectUri,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instance", "platforms"] });
      setExpanded(false);
      setAppSecret("");
      pushToast({ title: "OAuth config saved", body: `${platform.name} credentials updated.`, tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Save failed", body: err.message, tone: "error" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => socialPlatformsApi.deleteOAuthConfig(platform.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instance", "platforms"] });
      setAppId("");
      setAppSecret("");
      setRedirectUri("");
      setExpanded(false);
      pushToast({ title: "OAuth config cleared", body: `${platform.name} credentials removed.`, tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Clear failed", body: err.message, tone: "error" });
    },
  });

  const help = oauthHelpBySlug[platform.slug];

  const isFirstSave = !platform.hasOauthSecret;
  const canSave =
    appId.trim().length > 0 &&
    redirectUri.trim().startsWith("https://") &&
    (isFirstSave ? appSecret.trim().length > 0 : true);

  return (
    <div className="border-t border-border mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        OAuth Configuration
      </button>

      {expanded && (
        <div className="pb-4 space-y-3">
          {/* App ID */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">App ID</label>
            <Input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="App ID from developer console"
              className="h-8 text-sm"
            />
          </div>

          {/* App Secret */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">App Secret</label>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder={platform.hasOauthSecret ? "Leave blank to keep current secret" : "App Secret from developer console"}
                className="h-8 text-sm pr-9"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showSecret ? "Hide secret" : "Show secret"}
              >
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              ⚠ Never share this value
            </p>
          </div>

          {/* Redirect URI */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Redirect URI</label>
            <Input
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="https://your-domain.com/api/oauth/callback/instagram"
              className="h-8 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              ℹ This URI must exactly match what is registered in the platform's developer console
            </p>
          </div>

          {/* Help link */}
          {help && (
            <a
              href={help.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              How to obtain these credentials
            </a>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              className={cn("h-7 text-xs", !canSave && "opacity-50 cursor-not-allowed")}
            >
              {saveMutation.isPending ? "Saving…" : "Save configuration"}
            </Button>
            {platform.hasOauthSecret && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="h-7 text-xs text-destructive hover:text-destructive"
              >
                {clearMutation.isPending ? "Clearing…" : "Clear configuration"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
