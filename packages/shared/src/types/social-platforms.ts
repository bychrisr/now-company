export interface PlatformCapabilities {
  supports_video: boolean;
  supports_carousel: boolean;
  supports_stories: boolean;
  supports_dm: boolean;
  supports_live: boolean;
  supports_ads: boolean;
  supports_scheduling: boolean;
  /** Link permitido diretamente no corpo do post */
  link_in_body: boolean;
  /** Links penalizam o alcance orgânico */
  link_penalty: boolean;
  has_api: boolean;
  api_type: "public" | "private" | "paid" | "none";
  primary_content_type: "video" | "image" | "text" | "audio" | "mixed";
  /** Prioridade para mercado brasileiro */
  is_br_priority: boolean;
}

export interface PlatformCopySpecs {
  max_body_chars: number | null;
  max_title_chars: number | null;
  /** null = sem limite; 0 = não suportado */
  max_hashtags: number | null;
  supports_mentions: boolean;
  supports_markdown: boolean;
  notes?: string;
}

export interface ImageFormatSlot {
  /** Identificador do slot: feed_square, feed_portrait, story, thumbnail, cover, etc. */
  slot: string;
  width: number;
  height: number;
  aspect_ratio: string;
  max_file_size_mb: number;
  formats: string[];
  /** Duração máxima em segundos para slots de vídeo */
  max_duration_seconds?: number;
}

export type PlatformImageSpecs = ImageFormatSlot[];
