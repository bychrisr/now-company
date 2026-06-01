import { type Router, type Request, type Response } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import {
  createIssueAttachmentMetadataSchema,
} from "@paperclipai/shared";
import {
  isInlineAttachmentContentType,
  normalizeIssueAttachmentMaxBytes,
  normalizeContentType,
  SVG_CONTENT_TYPE,
} from "../attachment-types.js";
import { logger } from "../middleware/logger.js";
import type { StorageService } from "../storage/types.js";
import {
  companyService,
  heartbeatService,
  issueService,
  logActivity,
} from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

// Helper local (duplicado de issues.ts — pequeno e estável)
function withContentPath<T extends { id: string }>(attachment: T) {
  return {
    ...attachment,
    contentPath: `/api/attachments/${attachment.id}/content`,
  };
}

async function runSingleFileUpload(req: Request, res: Response, fileSizeLimit: number) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: fileSizeLimit, files: 1 },
  });
  await new Promise<void>((resolve, reject) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function addIssueAttachmentRoutes(
  router: Router,
  db: Db,
  svc: ReturnType<typeof issueService>,
  storage: StorageService,
  _heartbeat: ReturnType<typeof heartbeatService>,
  deps: {
    assertAgentIssueMutationAllowed: (
      req: Request,
      res: Response,
      issue: { id: string; companyId: string; status: string; assigneeAgentId: string | null },
    ) => Promise<boolean>;
    assertDeliverableMutationAllowedByRunContext: (
      req: Request,
      res: Response,
      issue: { id: string; companyId: string },
    ) => Promise<boolean>;
  },
) {
  const companiesSvc = companyService(db);
  const { assertAgentIssueMutationAllowed, assertDeliverableMutationAllowedByRunContext } = deps;

  router.get("/issues/:id/attachments", async (req, res) => {
    const issueId = req.params.id as string;
    const issue = await svc.getById(issueId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const attachments = await svc.listAttachments(issueId);
    res.json(attachments.map(withContentPath));
  });

  router.post("/companies/:companyId/issues/:issueId/attachments", async (req, res) => {
    const companyId = req.params.companyId as string;
    const issueId = req.params.issueId as string;
    assertCompanyAccess(req, companyId);
    const issue = await svc.getById(issueId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    if (issue.companyId !== companyId) {
      res.status(422).json({ error: "Issue does not belong to company" });
      return;
    }
    if (!(await assertAgentIssueMutationAllowed(req, res, issue))) return;
    if (!(await assertDeliverableMutationAllowedByRunContext(req, res, issue))) return;

    const company = await companiesSvc.getById(companyId);
    const attachmentMaxBytes = normalizeIssueAttachmentMaxBytes(company?.attachmentMaxBytes);

    try {
      await runSingleFileUpload(req, res, attachmentMaxBytes);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(422).json({ error: `Attachment exceeds ${attachmentMaxBytes} bytes` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const file = (req as Request & { file?: { mimetype: string; buffer: Buffer; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }
    const contentType = normalizeContentType(file.mimetype);
    if (file.buffer.length <= 0) {
      res.status(422).json({ error: "Attachment is empty" });
      return;
    }

    const parsedMeta = createIssueAttachmentMetadataSchema.safeParse(req.body ?? {});
    if (!parsedMeta.success) {
      res.status(400).json({ error: "Invalid attachment metadata", details: parsedMeta.error.issues });
      return;
    }

    const actor = getActorInfo(req);
    const stored = await storage.putFile({
      companyId,
      namespace: `issues/${issueId}`,
      originalFilename: file.originalname || null,
      contentType,
      body: file.buffer,
    });

    const attachment = await svc.createAttachment({
      issueId,
      issueCommentId: parsedMeta.data.issueCommentId ?? null,
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.attachment_added",
      entityType: "issue",
      entityId: issueId,
      details: {
        attachmentId: attachment.id,
        originalFilename: attachment.originalFilename,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
      },
    });

    res.status(201).json(withContentPath(attachment));
  });

  router.get("/attachments/:attachmentId/content", async (req, res, next) => {
    const attachmentId = req.params.attachmentId as string;
    const attachment = await svc.getAttachmentById(attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    assertCompanyAccess(req, attachment.companyId);

    const object = await storage.getObject(attachment.companyId, attachment.objectKey);
    const responseContentType = normalizeContentType(attachment.contentType || object.contentType);
    res.setHeader("Content-Type", responseContentType);
    res.setHeader("Content-Length", String(attachment.byteSize || object.contentLength || 0));
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (responseContentType === SVG_CONTENT_TYPE) {
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
    }
    const filename = attachment.originalFilename ?? "attachment";
    const disposition = isInlineAttachmentContentType(responseContentType) ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename=\"${filename.replaceAll("\"", "")}\"`);

    object.stream.on("error", (err) => {
      next(err);
    });
    object.stream.pipe(res);
  });

  router.delete("/attachments/:attachmentId", async (req, res) => {
    const attachmentId = req.params.attachmentId as string;
    const attachment = await svc.getAttachmentById(attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    assertCompanyAccess(req, attachment.companyId);
    const issue = await svc.getById(attachment.issueId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    if (!(await assertAgentIssueMutationAllowed(req, res, issue))) return;
    if (!(await assertDeliverableMutationAllowedByRunContext(req, res, issue))) return;

    try {
      await storage.deleteObject(attachment.companyId, attachment.objectKey);
    } catch (err) {
      logger.warn({ err, attachmentId }, "storage delete failed while removing attachment");
    }

    const removed = await svc.removeAttachment(attachmentId);
    if (!removed) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: removed.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.attachment_removed",
      entityType: "issue",
      entityId: removed.issueId,
      details: {
        attachmentId: removed.id,
      },
    });

    res.json({ ok: true });
  });
}
