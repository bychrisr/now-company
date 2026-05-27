import type { Resource } from "i18next";

import { assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "en" as const;

const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const localeMessages = Object.fromEntries(
  Object.entries(localeModules).map(([path, messages]) => {
    const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
    if (!locale) {
      throw new Error(`Invalid locale file path: ${path}`);
    }
    return [locale, messages];
  }),
);

if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

export const supportedLocales = Object.keys(localeMessages);

export const LOCALE_NAMES: Record<string, string> = {
  ar: "العربية (Arabic)",
  bn: "বাংলা (Bengali)",
  cs: "Čeština (Czech)",
  da: "Dansk (Danish)",
  de: "Deutsch (German)",
  el: "Ελληνικά (Greek)",
  en: "English",
  es: "Español (Spanish)",
  fa: "فارسی (Persian)",
  fi: "Suomi (Finnish)",
  fil: "Filipino",
  fr: "Français (French)",
  he: "עברית (Hebrew)",
  hi: "हिन्दी (Hindi)",
  hu: "Magyar (Hungarian)",
  id: "Bahasa Indonesia (Indonesian)",
  it: "Italiano (Italian)",
  ja: "日本語 (Japanese)",
  ko: "한국어 (Korean)",
  mr: "मराठी (Marathi)",
  ms: "Bahasa Melayu (Malay)",
  nb: "Norsk bokmål (Norwegian)",
  nl: "Nederlands (Dutch)",
  pa: "ਪੰਜਾਬੀ (Punjabi)",
  pl: "Polski (Polish)",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  ro: "Română (Romanian)",
  ru: "Русский (Russian)",
  sv: "Svenska (Swedish)",
  sw: "Kiswahili (Swahili)",
  ta: "தமிழ் (Tamil)",
  te: "తెలుగు (Telugu)",
  th: "ไทย (Thai)",
  tr: "Türkçe (Turkish)",
  uk: "Українська (Ukrainian)",
  ur: "اردو (Urdu)",
  vi: "Tiếng Việt (Vietnamese)",
  "zh-CN": "简体中文 (Chinese Simplified)",
  "zh-TW": "繁體中文 (Chinese Traditional)",
};

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [locale, { translation: messages }]),
) as Resource;

export type SupportedLocale = keyof typeof localeMessages;
