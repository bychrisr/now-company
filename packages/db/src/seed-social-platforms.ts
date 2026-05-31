import { sql } from "drizzle-orm";
import type { createDb } from "./client.js";
import { socialPlatforms } from "./schema/index.js";
import { SOCIAL_PLATFORMS_SEED } from "./seed-data/social-platforms.js";

/**
 * Seed completo de 25 plataformas com capabilities, copy_specs e image_specs.
 * Upsert idempotente via onConflictDoUpdate — seguro rodar múltiplas vezes.
 * Fonte: docs/references/global-content-formats-atlas.md v3.1
 */
export async function seedSocialPlatforms(db: ReturnType<typeof createDb>) {
  await db
    .insert(socialPlatforms)
    .values(SOCIAL_PLATFORMS_SEED)
    .onConflictDoUpdate({
      target: socialPlatforms.slug,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        sortOrder: sql`excluded.sort_order`,
        capabilities: sql`excluded.capabilities`,
        copySpecs: sql`excluded.copy_specs`,
        imageSpecs: sql`excluded.image_specs`,
        description: sql`excluded.description`,
        websiteUrl: sql`excluded.website_url`,
        updatedAt: new Date(),
      },
    });

  console.log(`  ✓ social_platforms seeded (${SOCIAL_PLATFORMS_SEED.length} platforms, upsert idempotent)`);
}
