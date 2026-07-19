import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestStatus, WorkSubmission } from "@/types";
import {
  parseWorkRevision,
  parseWorkSubmit,
  WORK_ACCEPTED_PREFIX,
  WORK_REVISION_PREFIX,
  WORK_SUBMIT_PREFIX,
} from "@/lib/data/work-lifecycle-messages";

type LifecycleMessage = {
  content: string;
  created_at: string;
};

export type WorkLifecycleState = {
  effectiveStatus: RequestStatus;
  revisionFeedback: string | null;
  latestSubmission: WorkSubmission | null;
  awaitingResubmit: boolean;
};

function buildSubmissionFromPayload(
  requestId: string,
  providerId: string,
  createdAt: string,
  payload: NonNullable<ReturnType<typeof parseWorkSubmit>>
): WorkSubmission {
  return {
    id: `msg-${createdAt}`,
    request_id: requestId,
    provider_id: providerId,
    summary: payload.summary,
    attachments: payload.attachments,
    revision_number: payload.revision,
    created_at: createdAt,
  };
}

export function deriveLifecycleStateFromMessages(
  requestId: string,
  providerId: string | null,
  dbStatus: RequestStatus,
  messages: LifecycleMessage[]
): WorkLifecycleState {
  if (dbStatus !== "in_progress" && dbStatus !== "pending_review") {
    return {
      effectiveStatus: dbStatus,
      revisionFeedback: null,
      latestSubmission: null,
      awaitingResubmit: false,
    };
  }

  const lifecycleMessages = messages
    .filter(
      (message) =>
        message.content.startsWith(WORK_SUBMIT_PREFIX) ||
        message.content.startsWith(WORK_REVISION_PREFIX) ||
        message.content.startsWith(WORK_ACCEPTED_PREFIX)
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let latestSubmission: WorkSubmission | null = null;
  let revisionFeedback: string | null = null;
  let pendingReview = false;
  let awaitingResubmit = false;

  for (const message of lifecycleMessages) {
    const submit = parseWorkSubmit(message.content);
    if (submit && providerId) {
      latestSubmission = buildSubmissionFromPayload(
        requestId,
        providerId,
        message.created_at,
        submit
      );
      pendingReview = true;
      awaitingResubmit = false;
      revisionFeedback = null;
      continue;
    }

    const revision = parseWorkRevision(message.content);
    if (revision) {
      revisionFeedback = revision.feedback;
      pendingReview = false;
      awaitingResubmit = true;
      continue;
    }

    if (message.content.startsWith(WORK_ACCEPTED_PREFIX)) {
      pendingReview = false;
      awaitingResubmit = false;
      revisionFeedback = null;
    }
  }

  const effectiveStatus: RequestStatus =
    dbStatus === "pending_review" || pendingReview ? "pending_review" : "in_progress";

  return {
    effectiveStatus,
    revisionFeedback,
    latestSubmission,
    awaitingResubmit,
  };
}

export async function getWorkLifecycleState(
  supabase: SupabaseClient,
  requestId: string
): Promise<WorkLifecycleState | null> {
  const { data: request } = await supabase
    .from("requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return null;

  const { data: acceptedOffer } = await supabase
    .from("offers")
    .select("provider_id")
    .eq("request_id", requestId)
    .eq("status", "accepted")
    .maybeSingle();

  const dbStatus = request.status as RequestStatus;

  if (dbStatus === "pending_review") {
    const submission = await getDbWorkSubmission(supabase, requestId);
    return {
      effectiveStatus: "pending_review",
      revisionFeedback: null,
      latestSubmission: submission,
      awaitingResubmit: false,
    };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("request_id", requestId)
    .maybeSingle();

  if (!conversation?.id) {
    return {
      effectiveStatus: dbStatus,
      revisionFeedback: null,
      latestSubmission: null,
      awaitingResubmit: false,
    };
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("content, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  const derived = deriveLifecycleStateFromMessages(
    requestId,
    acceptedOffer?.provider_id ?? null,
    dbStatus,
    messages ?? []
  );

  return {
    ...derived,
    revisionFeedback: derived.revisionFeedback,
  };
}

async function getDbWorkSubmission(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase
    .from("work_submissions")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.message.includes("does not exist")) return null;
    return null;
  }
  return data;
}

export async function attachEffectiveRequestStatuses<T extends { id: string; status: string }>(
  supabase: SupabaseClient,
  requests: T[]
): Promise<T[]> {
  return Promise.all(
    requests.map(async (request) => {
      if (request.status !== "in_progress") return request;
      const lifecycle = await getWorkLifecycleState(supabase, request.id);
      if (!lifecycle || lifecycle.effectiveStatus === request.status) return request;
      return { ...request, status: lifecycle.effectiveStatus };
    })
  );
}
