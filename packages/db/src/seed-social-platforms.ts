import type { createDb } from "./client.js";
import { socialPlatforms } from "./schema/index.js";

/**
 * Seed mínimo de 5 plataformas essenciais para validar o schema.
 * Idempotente via onConflictDoNothing no slug.
 * Story 1.3 expandirá para 15+ plataformas com specs detalhados.
 */
export async function seedSocialPlatforms(db: ReturnType<typeof createDb>) {
  const initialPlatforms = [
    { slug: "instagram", name: "Instagram", category: "social", sortOrder: 10 },
    { slug: "youtube", name: "YouTube", category: "video", sortOrder: 20 },
    { slug: "linkedin", name: "LinkedIn", category: "social", sortOrder: 30 },
    { slug: "tiktok", name: "TikTok", category: "video", sortOrder: 40 },
    { slug: "twitter-x", name: "Twitter/X", category: "social", sortOrder: 50 },
  ];

  await db
    .insert(socialPlatforms)
    .values(initialPlatforms)
    .onConflictDoNothing({ target: socialPlatforms.slug });

  console.log(`  ✓ social_platforms seeded (${initialPlatforms.length} platforms, idempotent)`);
}
