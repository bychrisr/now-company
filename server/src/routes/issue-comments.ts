import { type Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { addIssueCommentSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logger } from "../middleware/logger.js";
import {
  heartbeatService,
  issueReferenceService,
  issueService,
  issueThreadInteractionService,
  logActivity,
} from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const MAX_ISSUE_COMMENT_LIMIT = 500;

// Helpers locais — duplicados (pequenos e estáveis)
function isClosedIssueStatus(status: string | null | undefined): status is "done" | "cancelled" {
  return status === "done" || status === "cancelled";
}

function shouldImplicitlyMoveCommentedIssueToTodo(input: {
  issueStatus: string | null | undefined;
  assigneeAgentId: string | null | undefined;
  actorType: "agent" | "user";
  actorId: string;
}) {
  // Only human comments should implicitly reopen finished work.
  // Agent-authored comments remain communicative unless reopen was explicit.
  if (input.actorType !== "user") return false;
  if (!isClosedIssueStatus(input.issueStatus) && input.issueStatus !== "blocked") return false;
  if (typeof input.assigneeAgentId !== "string" || input.assigneeAgentId.length === 0) return false;
  return true;
}

function shouldHumanCommentResumeInProgressScheduledRetry(input: {
  hasComment: boolean;
  issueStatus: string | null | undefined;
  assigneeAgentId: string | null | undefined;
  actorType: "agent" | "user";
}) {
  if (!input.hasComment) return false;
  if (input.actorType !== "user") return false;
  if (input.issueStatus !== "in_progress") return false;
  return typeof input.assigneeAgentId === "string" && input.assigneeAgentId.length > 0;
}

function toValidTimestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isQueuedIssueCommentForActiveRun(params: {
  comment: {
    authorAgentId?: string | null;
    createdAt?: Date | string | null;
  };
  activeRun: {
    agentId?: string | null;
    startedAt?: Date | string | null;
    createdAt?: Date | string | null;
  };
}) {
  const activeRunStartedAtMs =
    toValidTimestamp(params.activeRun.startedAt) ?? toValidTimestamp(params.activeRun.createdAt);
  const commentCreatedAtMs = toValidTimestamp(params.comment.createdAt);

  if (activeRunStartedAtMs === null || commentCreatedAtMs === null) return false;
  if (params.comment.authorAgentId && params.comment.authorAgentId === params.activeRun.agentId) return false;
  return commentCreatedAtMs >= activeRunStartedAtMs;
}

function assertStructuredCommentFieldsAllowed(
  req: Request,
  res: Response,
  input: { presentation?: unknown; metadata?: unknown },
) {
  const hasStructuredFields = input.presentation !== undefined || input.metadata !== undefined;
  if (!hasStructuredFields) return true;
  if (req.actor.type === "board") return true;
  res.status(403).json({
    error: "Only board users may set structured comment presentation or metadata",
    details: {
      securityPrinciples: ["Least Privilege", "Secure Defaults", "Complete Mediation"],
    },
  });
  return false;
}

export function addIssueCommentRoutes(
  router: Router,
  db: Db,
  svc: ReturnType<typeof issueService>,
  heartbeat: ReturnType<typeof heartbeatService>,
  deps: {
    assertAgentIssueMutationAllowed: (
      req: Request,
      res: Response,
      issue: { id: string; companyId: string; status: string; assigneeAgentId: string | null },
    ) => Promise<boolean>;
    assertExplicitResumeIntentAllowed: (
      req: Request,
      res: Response,
      issue: { id: string; companyId: string; status: string; assigneeAgentId: string | null },
    ) => Promise<boolean>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClosedIssueExecutionWorkspace: (issue: { executionWorkspaceId?: string | null }) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    respondClosedIssueExecutionWorkspace: (res: Response, workspace: any) => void;
    cancelScheduledRetrySupersededByComment: (input: {
      scheduledRetryRunId: string | null | undefined;
      issue: { id: string; companyId: string };
      actor: ReturnType<typeof getActorInfo>;
    }) => Promise<string | null>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolveActiveIssueRun: (issue: any) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    revalidateActiveSourceRecoveryAfterCommittedWrite: (input: any) => Promise<any>;
    logExpiredRequestConfirmations: (input: {
      issue: { id: string; companyId: string; identifier?: string | null };
      interactions: Array<{ id: string; kind: string; status: string; result?: unknown }>;
      actor: ReturnType<typeof getActorInfo>;
      source: string;
    }) => Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summarizeIssueReferenceActivityDetails: (input: any) => Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summarizeIssueRelationForActivity: (relation: any) => any;
  },
) {
  const issueReferencesSvc = issueReferenceService(db);

  router.get("/issues/:id/comments", async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const afterCommentId =
      typeof req.query.after === "string" && req.query.after.trim().length > 0
        ? req.query.after.trim()
        : typeof req.query.afterCommentId === "string" && req.query.afterCommentId.trim().length > 0
          ? req.query.afterCommentId.trim()
          : null;
    const order =
      typeof req.query.order === "string" && req.query.order.trim().toLowerCase() === "asc"
        ? "asc"
        : "desc";
    const limitRaw =
      typeof req.query.limit === "string" && req.query.limit.trim().length > 0
        ? Number(req.query.limit)
        : null;
    const limit =
      limitRaw && Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), MAX_ISSUE_COMMENT_LIMIT)
        : null;
    const comments = await svc.listComments(id, {
      afterCommentId,
      order,
      limit,
    });
    res.json(comments);
  });

  router.get("/issues/:id/comments/:commentId", async (req, res) => {
    const id = req.params.id as string;
    const commentId = req.params.commentId as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const comment = await svc.getComment(commentId);
    if (!comment || comment.issueId !== id) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    res.json(comment);
  });

  router.delete("/issues/:id/comments/:commentId", async (req, res) => {
    const id = req.params.id as string;
    const commentId = req.params.commentId as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    if (!(await deps.assertAgentIssueMutationAllowed(req, res, issue))) return;

    const comment = await svc.getComment(commentId);
    if (!comment || comment.issueId !== id) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const actor = getActorInfo(req);
    const actorOwnsComment =
      actor.actorType === "agent"
        ? comment.authorAgentId === actor.agentId
        : comment.authorUserId === actor.actorId;
    if (!actorOwnsComment) {
      res.status(403).json({ error: "Only the comment author can cancel queued comments" });
      return;
    }

    const activeRun = await deps.resolveActiveIssueRun(issue);
    if (!activeRun) {
      res.status(409).json({ error: "Queued comment can no longer be canceled" });
      return;
    }

    if (!isQueuedIssueCommentForActiveRun({ comment, activeRun })) {
      res.status(409).json({ error: "Only queued comments can be canceled" });
      return;
    }

    const removed = await svc.removeComment(commentId);
    if (!removed) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.comment_cancelled",
      entityType: "issue",
      entityId: issue.id,
      details: {
        commentId: removed.id,
        bodySnippet: removed.body.slice(0, 120),
        identifier: issue.identifier,
        issueTitle: issue.title,
        source: "queue_cancel",
        queueTargetRunId: activeRun.id,
      },
    });

    res.json(removed);
  });

  router.post("/issues/:id/comments", validate(addIssueCommentSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    if (!(await deps.assertAgentIssueMutationAllowed(req, res, issue))) return;
    if (!assertStructuredCommentFieldsAllowed(req, res, {
      presentation: req.body.presentation,
      metadata: req.body.metadata,
    })) return;
    const closedExecutionWorkspace = await deps.getClosedIssueExecutionWorkspace(issue);
    if (closedExecutionWorkspace) {
      deps.respondClosedIssueExecutionWorkspace(res, closedExecutionWorkspace);
      return;
    }

    const actor = getActorInfo(req);
    const reopenRequested = req.body.reopen === true;
    const resumeRequested = req.body.resume === true;
    const interruptRequested = req.body.interrupt === true;
    if (resumeRequested === true && !(await deps.assertExplicitResumeIntentAllowed(req, res, issue))) return;
    if (resumeRequested !== true && reopenRequested === true && req.actor.type === "agent") {
      if (!(await deps.assertExplicitResumeIntentAllowed(req, res, issue))) return;
    }
    const isClosed = isClosedIssueStatus(issue.status);
    const isBlocked = issue.status === "blocked";
    const explicitMoveToTodoRequested = reopenRequested || resumeRequested === true;
    const scheduledRetryForHumanComment =
      shouldHumanCommentResumeInProgressScheduledRetry({
        hasComment: true,
        issueStatus: issue.status,
        assigneeAgentId: issue.assigneeAgentId,
        actorType: actor.actorType,
      })
        ? await svc.getCurrentScheduledRetry(issue.id)
        : null;
    const shouldResumeInProgressScheduledRetry =
      !!scheduledRetryForHumanComment &&
      scheduledRetryForHumanComment.agentId === issue.assigneeAgentId;
    const effectiveMoveToTodoRequested =
      explicitMoveToTodoRequested ||
      shouldImplicitlyMoveCommentedIssueToTodo({
        issueStatus: issue.status,
        assigneeAgentId: issue.assigneeAgentId,
        actorType: actor.actorType,
        actorId: actor.actorId,
      }) ||
      shouldResumeInProgressScheduledRetry;
    const hasUnresolvedFirstClassBlockers =
      isBlocked && effectiveMoveToTodoRequested
        ? (await svc.getDependencyReadiness(issue.id)).unresolvedBlockerCount > 0
        : false;
    if (resumeRequested === true && isBlocked && hasUnresolvedFirstClassBlockers) {
      res.status(409).json({ error: "Issue follow-up blocked by unresolved blockers" });
      return;
    }
    let reopened = false;
    let reopenFromStatus: string | null = null;
    let interruptedRunId: string | null = null;
    let currentIssue = issue;
    const commentReferenceSummaryBefore = await issueReferencesSvc.listIssueReferenceSummary(issue.id);

    let scheduledRetrySupersededByComment = false;
    let cancelledScheduledRetryRunId: string | null = null;
    if (
      effectiveMoveToTodoRequested &&
      (isClosed || (isBlocked && !hasUnresolvedFirstClassBlockers) || shouldResumeInProgressScheduledRetry)
    ) {
      scheduledRetrySupersededByComment = shouldResumeInProgressScheduledRetry && issue.status === "in_progress";
      cancelledScheduledRetryRunId = scheduledRetrySupersededByComment
        ? await deps.cancelScheduledRetrySupersededByComment({
            scheduledRetryRunId: scheduledRetryForHumanComment?.runId,
            issue,
            actor,
          })
        : null;
      const reopenedIssue = await svc.update(id, { status: "todo" });
      if (!reopenedIssue) {
        res.status(404).json({ error: "Issue not found" });
        return;
      }
      reopened = isClosed || (isBlocked && !hasUnresolvedFirstClassBlockers);
      reopenFromStatus = reopened ? issue.status : null;
      currentIssue = reopenedIssue;

      await logActivity(db, {
        companyId: currentIssue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.updated",
        entityType: "issue",
        entityId: currentIssue.id,
        details: {
          status: "todo",
          ...(reopened ? { reopened: true, reopenedFrom: reopenFromStatus } : {}),
          ...(scheduledRetrySupersededByComment
            ? {
                scheduledRetrySupersededByComment: true,
                scheduledRetryRunId: scheduledRetryForHumanComment?.runId ?? null,
                ...(cancelledScheduledRetryRunId ? { cancelledScheduledRetryRunId } : {}),
              }
            : {}),
          source: "comment",
          ...(resumeRequested === true ? { resumeIntent: true, followUpRequested: true } : {}),
          identifier: currentIssue.identifier,
        },
      });
    }

    if (interruptRequested) {
      if (req.actor.type !== "board") {
        res.status(403).json({ error: "Only board users can interrupt active runs from issue comments" });
        return;
      }

      const runToInterrupt = await deps.resolveActiveIssueRun(currentIssue);
      if (runToInterrupt) {
        const cancelled = await heartbeat.cancelRun(runToInterrupt.id);
        if (cancelled) {
          interruptedRunId = cancelled.id;
          await logActivity(db, {
            companyId: cancelled.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "heartbeat.cancelled",
            entityType: "heartbeat_run",
            entityId: cancelled.id,
            details: { agentId: cancelled.agentId, source: "issue_comment_interrupt", issueId: currentIssue.id },
          });
        }
      }
    }

    const comment = await svc.addComment(id, req.body.body, {
      agentId: actor.agentId ?? undefined,
      userId: actor.actorType === "user" ? actor.actorId : undefined,
      runId: actor.runId,
    }, {
      authorType: req.body.authorType ?? (actor.actorType === "agent" ? "agent" : "user"),
      presentation: req.body.presentation ?? null,
      metadata: req.body.metadata ?? null,
    });
    await issueReferencesSvc.syncComment(comment.id);
    const commentReferenceSummaryAfter = await issueReferencesSvc.listIssueReferenceSummary(currentIssue.id);
    const commentReferenceDiff = issueReferencesSvc.diffIssueReferenceSummary(
      commentReferenceSummaryBefore,
      commentReferenceSummaryAfter,
    );

    if (actor.runId) {
      await heartbeat.reportRunActivity(actor.runId).catch((err) =>
        logger.warn({ err, runId: actor.runId }, "failed to clear detached run warning after issue comment"));
    }

    await logActivity(db, {
      companyId: currentIssue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.comment_added",
      entityType: "issue",
      entityId: currentIssue.id,
      details: {
        commentId: comment.id,
        bodySnippet: comment.body.slice(0, 120),
        identifier: currentIssue.identifier,
        issueTitle: currentIssue.title,
        ...(resumeRequested === true ? { resumeIntent: true, followUpRequested: true } : {}),
        ...(reopened ? { reopened: true, reopenedFrom: reopenFromStatus, source: "comment" } : {}),
        ...(scheduledRetrySupersededByComment
          ? {
              scheduledRetrySupersededByComment: true,
              scheduledRetryRunId: scheduledRetryForHumanComment?.runId ?? null,
              ...(cancelledScheduledRetryRunId ? { cancelledScheduledRetryRunId } : {}),
            }
          : {}),
        ...(interruptedRunId ? { interruptedRunId } : {}),
        ...deps.summarizeIssueReferenceActivityDetails({
          addedReferencedIssues: commentReferenceDiff.addedReferencedIssues.map(deps.summarizeIssueRelationForActivity),
          removedReferencedIssues: commentReferenceDiff.removedReferencedIssues.map(deps.summarizeIssueRelationForActivity),
          currentReferencedIssues: commentReferenceDiff.currentReferencedIssues.map(deps.summarizeIssueRelationForActivity),
        }),
      },
    });

    const expiredInteractions = await issueThreadInteractionService(db).expireRequestConfirmationsSupersededByComment(
      currentIssue,
      comment,
      {
        agentId: actor.agentId,
        userId: actor.actorType === "user" ? actor.actorId : null,
      },
    );
    await deps.logExpiredRequestConfirmations({
      issue: currentIssue,
      interactions: expiredInteractions,
      actor,
      source: "issue.comment",
    });

    await deps.revalidateActiveSourceRecoveryAfterCommittedWrite({
      issue: currentIssue,
      trigger: "comment",
      actor,
      statusChanged: reopened || scheduledRetrySupersededByComment,
      resumeRequested: resumeRequested === true,
      reopened,
      blockedToTodoRecovery: reopened && reopenFromStatus === "blocked" && currentIssue.status === "todo",
    });

    // Merge all wakeups from this comment into one enqueue per agent to avoid duplicate runs.
    void (async () => {
      const wakeups = new Map<string, Parameters<typeof heartbeat.wakeup>[1]>();
      const assigneeId = currentIssue.assigneeAgentId;
      const actorIsAgent = actor.actorType === "agent";
      const selfComment = actorIsAgent && actor.actorId === assigneeId;
      const skipWake = selfComment || isClosed;
      if (assigneeId && (reopened || !skipWake)) {
        if (reopened) {
          wakeups.set(assigneeId, {
            source: "automation",
            triggerDetail: "system",
            reason: "issue_reopened_via_comment",
            payload: {
              issueId: currentIssue.id,
              commentId: comment.id,
              reopenedFrom: reopenFromStatus,
              mutation: "comment",
              ...(resumeRequested === true ? { resumeIntent: true, followUpRequested: true } : {}),
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
            requestedByActorType: actor.actorType,
            requestedByActorId: actor.actorId,
            contextSnapshot: {
              issueId: currentIssue.id,
              taskId: currentIssue.id,
              commentId: comment.id,
              wakeCommentId: comment.id,
              source: "issue.comment.reopen",
              wakeReason: "issue_reopened_via_comment",
              reopenedFrom: reopenFromStatus,
              ...(resumeRequested === true ? { resumeIntent: true, followUpRequested: true } : {}),
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
          });
        } else {
          wakeups.set(assigneeId, {
            source: "automation",
            triggerDetail: "system",
            reason: "issue_commented",
            payload: {
              issueId: currentIssue.id,
              commentId: comment.id,
              mutation: "comment",
              ...(resumeRequested === true ? { resumeIntent: true, followUpRequested: true } : {}),
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
            requestedByActorType: actor.actorType,
            requestedByActorId: actor.actorId,
            contextSnapshot: {
              issueId: currentIssue.id,
              taskId: currentIssue.id,
              commentId: comment.id,
              wakeCommentId: comment.id,
              source: "issue.comment",
              wakeReason: "issue_commented",
              ...(resumeRequested === true ? { resumeIntent: true, followUpRequested: true } : {}),
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
          });
        }
      }

      let mentionedIds: string[] = [];
      try {
        mentionedIds = await svc.findMentionedAgents(issue.companyId, req.body.body);
      } catch (err) {
        logger.warn({ err, issueId: id }, "failed to resolve @-mentions");
      }

      for (const mentionedId of mentionedIds) {
        if (wakeups.has(mentionedId)) continue;
        if (actorIsAgent && actor.actorId === mentionedId) continue;
        wakeups.set(mentionedId, {
          source: "automation",
          triggerDetail: "system",
          reason: "issue_comment_mentioned",
          payload: { issueId: id, commentId: comment.id },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: {
            issueId: id,
            taskId: id,
            commentId: comment.id,
            wakeCommentId: comment.id,
            wakeReason: "issue_comment_mentioned",
            source: "comment.mention",
          },
        });
      }

      for (const [agentId, wakeup] of wakeups.entries()) {
        heartbeat
          .wakeup(agentId, wakeup)
          .catch((err) => logger.warn({ err, issueId: currentIssue.id, agentId }, "failed to wake agent on issue comment"));
      }
    })();

    res.status(201).json(comment);
  });
}
