export interface OAuthHelpEntry {
  url: string;
  steps: string[];
}

export const oauthHelpBySlug: Record<string, OAuthHelpEntry> = {
  instagram: {
    url: "https://developers.facebook.com/apps",
    steps: [
      "Go to developers.facebook.com/apps and create a new app",
      "Select the 'Business' type",
      "Under Products, add 'Instagram Basic Display'",
      "Copy the App ID and App Secret from the 'Basic Settings' tab",
      "Under 'Instagram Basic Display > Settings', add the Redirect URI exactly as shown above",
      "Activate the app for production before using with real users",
    ],
  },
  youtube: {
    url: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "Go to console.cloud.google.com and create a project",
      "Enable 'YouTube Data API v3' under APIs & Services",
      "Under Credentials, create 'OAuth 2.0 Client ID' of type 'Web Application'",
      "Copy the Client ID (App ID) and Client Secret (App Secret)",
      "Add the Redirect URI under 'Authorized redirect URIs'",
    ],
  },
};
