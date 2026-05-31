import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { socialPlatforms } from "@paperclipai/db";
import { patchSocialPlatformSchema } from "@paperclipai/shared";
import { assertInstanceAdmin, getActorInfo } from "./authz.js";
import { badRequest, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logActivity, instanceSettingsService } from "../services/index.js";

export function socialPlatformsAdminRoutes(db: Db) {
  const router = Router();

  router.get("/instance/platforms", async (req, res) => {
    assertInstanceAdmin(req);
    const platforms = await db
      .select()
      .from(socialPlatforms)
      .orderBy(asc(socialPlatforms.sortOrder), asc(socialPlatforms.name));
    res.json(platforms);
  });

  router.patch(
    "/instance/platforms/:id",
    validate(patchSocialPlatformSchema),
    async (req, res) => {
      assertInstanceAdmin(req);

      const id = req.params.id;
      const parsedId = z.string().uuid().safeParse(id);
      if (!parsedId.success) {
        throw badRequest("Invalid UUID format");
      }

      const [updated] = await db
        .update(socialPlatforms)
        .set({
          ...(req.body.status !== undefined ? { status: req.body.status } : {}),
          ...(req.body.sortOrder !== undefined ? { sortOrder: req.body.sortOrder } : {}),
          updatedAt: new Date(),
        })
        .where(eq(socialPlatforms.id, parsedId.data))
        .returning();

      if (!updated) {
        throw notFound("Social platform not found");
      }

      const svc = instanceSettingsService(db);
      const actor = getActorInfo(req);
      const companyIds = await svc.listCompanyIds();

      await Promise.all(
        companyIds.map((companyId) =>
          logActivity(db, {
            companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "instance.social_platform_updated",
            entityType: "social_platform",
            entityId: updated.id,
            details: {
              platformSlug: updated.slug,
              status: updated.status,
              sortOrder: updated.sortOrder,
            },
          })
        )
      );

      res.json(updated);
    }
  );

  return router;
}
