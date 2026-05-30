const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event("auth:unauthorized"));
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const apiPatch = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: "PATCH",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const apiDelete = <T>(path: string) => api<T>(path, { method: "DELETE" });

const apiPut = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: "PUT",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

// ── Types ────────────────────────────────────────────────────────────────────

export type ApiMember = {
  id: number;
  name: string;
  initials: string;
  email: string;
  joined_date: string;
  banned: boolean;
  roles: string[];
  is_superuser: boolean;
  is_virtual: boolean;
  show_on_about_page: boolean;
  rule_allow_two_in_a_row: boolean;
  rule_allow_weekday_after_sunday: boolean;
  rule_no_weekends: boolean;
  has_avatar: boolean;
};

export type ApiLocation = {
  id: number;
  name: string;
  address: string;
  disabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiClubNight = {
  id: number;
  number: number;
  name: string;
  date: string;
  time_from: string;
  time_to: string;
  location: string;
  location_id: number | null;
  location_name: string | null;
  location_address: string | null;
  vagt_member_id: number | null;
  assigned_member_name: string | null;
  assigned_member_initials: string | null;
  vagt_member_has_avatar: boolean;
  opted_out_members: { id: number; name: string; initials: string }[];
  vagt_confirmed: boolean;
  cancelled: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  /** 'draft' — only visible to admins; 'published' — visible to all Vagter */
  status: "draft" | "published";
};

export type ApiScheduleReview = {
  id: number | null;
  member_id: number;
  reviewed_at: string | null;
  member_name: string | null;
  member_initials: string | null;
  is_virtual: boolean;
};

export type ApiChannel = {
  id: number;
  name: string;
  type: string;
};

export type ApiMessage = {
  id: number;
  channel_id: number;
  sender_id: number | null;
  body: string;
  sent_at: string;
  edited_at?: string | null;
  is_deleted?: boolean;
  sender_name: string | null;
  sender_initials: string | null;
  type?: "shift_swap";
  shift_night_id?: number;
  swap_status?: "pending" | "taken" | "cancelled";
  taken_by_member_id?: number | null;
  taken_by_name?: string | null;
  taken_by_initials?: string | null;
};

export type AuthUser = {
  id: number;
  name: string;
  initials: string;
  roles: string[];
  is_superuser?: boolean;
};

// ── Members ──────────────────────────────────────────────────────────────────

export const getMembers = () => api<ApiMember[]>("/api/members");

export type ApiPublicMember = {
  id: number;
  name: string;
  initials: string;
  show_on_about_page: boolean;
  roles: string[];
  has_avatar: boolean;
};

export const getPublicMembers = () =>
  fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/members/public`).then(
    (r) => r.json() as Promise<ApiPublicMember[]>,
  );
export const getMember = (id: number) => api<ApiMember>(`/api/members/${id}`);
export const createVirtualMember = (name: string, initials: string) =>
  apiPost<ApiMember>("/api/members", { name, initials });
export const realizeMember = (id: number, email: string) =>
  apiPost<{
    merged: boolean;
    memberId: number;
    name?: string;
    member?: ApiMember;
  }>(`/api/members/${id}/realize`, { email });
export const patchMember = (id: number, body: Partial<ApiMember>) =>
  apiPatch<ApiMember>(`/api/members/${id}`, body);
export const putMemberRoles = (id: number, roles: string[]) =>
  api<ApiMember>(`/api/members/${id}/roles`, {
    method: "PUT",
    body: JSON.stringify({ roles }),
  });
export const getMemberShifts = (id: number) =>
  api<ApiClubNight[]>(`/api/members/${id}/shifts`);

// ── Club Nights ───────────────────────────────────────────────────────────────

export const getClubNights = (upcoming?: boolean) =>
  api<ApiClubNight[]>(`/api/club-nights${upcoming ? "?upcoming=true" : ""}`);
export const getClubNight = (id: number) =>
  api<ApiClubNight>(`/api/club-nights/${id}`);
export const postClubNight = (body: Partial<ApiClubNight>) =>
  apiPost<ApiClubNight>("/api/club-nights", body);
export const patchClubNight = (id: number, body: Partial<ApiClubNight>) =>
  apiPatch<ApiClubNight>(`/api/club-nights/${id}`, body);
export const putClubNight = (
  id: number,
  body: {
    name?: string;
    time_from?: string;
    time_to?: string;
    location_id?: number | null;
  },
) => apiPut<ApiClubNight>(`/api/club-nights/${id}`, body);
export const deleteClubNight = (id: number) =>
  apiDelete<{ ok: boolean }>(`/api/club-nights/${id}`);
export const postClubNightOptOut = (nightId: number) =>
  apiPost<{ ok: boolean }>(`/api/club-nights/${nightId}/opt-out`);
export const deleteClubNightOptOut = (nightId: number) =>
  apiDelete<{ ok: boolean }>(`/api/club-nights/${nightId}/opt-out`);
export const postClubNightConfirm = (nightId: number) =>
  apiPost<ApiClubNight>(`/api/club-nights/${nightId}/confirm`);
export const getFollowingNightIds = () =>
  api<number[]>("/api/club-nights/following");
export const postClubNightFollow = (nightId: number) =>
  apiPost<{ ok: boolean }>(`/api/club-nights/${nightId}/follow`);
export const deleteClubNightFollow = (nightId: number) =>
  apiDelete<{ ok: boolean }>(`/api/club-nights/${nightId}/follow`);
export const cancelClubNight = (nightId: number) =>
  apiPost<ApiClubNight>(`/api/club-nights/${nightId}/cancel`);
export const publishDraftNights = () =>
  apiPost<{ published: number; nights: ApiClubNight[] }>(
    "/api/club-nights/publish-drafts",
  );

// ── Locations ─────────────────────────────────────────────────────────────────

export const getLocations = () => api<ApiLocation[]>("/api/locations");
export const createLocation = (body: { name: string; address: string }) =>
  apiPost<ApiLocation>("/api/locations", body);
export const disableLocation = (id: number) =>
  apiPatch<ApiLocation>(`/api/locations/${id}/disable`);

// ── Schedule Reviews ──────────────────────────────────────────────────────────

export const postScheduleReview = () =>
  apiPost<{ ok: boolean; reviewed_at: string }>("/api/schedule-reviews");
export const getScheduleReviews = () =>
  api<ApiScheduleReview[]>("/api/schedule-reviews");
export const getMyScheduleReview = () =>
  api<ApiScheduleReview | null>("/api/schedule-reviews/me");

// ── Channels & Messages ───────────────────────────────────────────────────────

export const getChannels = () => api<ApiChannel[]>("/api/channels");
export const getMessages = (channelId: number) =>
  api<ApiMessage[]>(`/api/channels/${channelId}/messages`);
export const postMessage = (
  channelId: number,
  sender_id: number,
  body: string,
  extra?: Partial<Pick<ApiMessage, "type" | "shift_night_id">>,
) =>
  apiPost<ApiMessage>(`/api/channels/${channelId}/messages`, {
    sender_id,
    body,
    ...extra,
  });
export const patchMessage = (
  channelId: number,
  messageId: number,
  patch: Partial<
    Pick<ApiMessage, "body" | "swap_status" | "taken_by_member_id">
  >,
) =>
  apiPatch<ApiMessage>(
    `/api/channels/${channelId}/messages/${messageId}`,
    patch,
  );
export const deleteMessage = (channelId: number, messageId: number) =>
  apiDelete<ApiMessage>(`/api/channels/${channelId}/messages/${messageId}`);
export const postTyping = (channelId: number, name: string) =>
  apiPost<void>(`/api/channels/${channelId}/typing`, { name });
export const markChannelRead = (channelId: number, messageId: number) =>
  apiPost<{ ok: boolean }>(`/api/channels/${channelId}/mark-read`, {
    message_id: messageId,
  });
export const getChannelLastRead = (channelId: number) =>
  api<{ last_message_id: number }>(`/api/channels/${channelId}/last-read`);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const postLogin = (email: string, password: string) =>
  apiPost<AuthUser>("/api/auth/login", { email, password });

export const postLogout = () => apiPost<{ ok: boolean }>("/api/auth/logout");

export const getMe = () => api<AuthUser>("/api/auth/me");

/** Silent version — does NOT dispatch auth:unauthorized on 401. Used for the
 *  initial session check in AuthProvider so an expired cookie doesn't trigger
 *  a redirect-to-login when the user is browsing a public page. */
export const fetchMeSilent = (): Promise<AuthUser | null> =>
  fetch(`${BASE}/api/auth/me`, { credentials: "include" })
    .then((r) => (r.ok ? (r.json() as Promise<AuthUser>) : null))
    .catch(() => null);

/** Re-issues the auth cookie with fresh roles from the DB. */
export const postRefreshAuth = () => apiPost<AuthUser>("/api/auth/refresh");

export const postRegister = (name: string, email: string, password: string) =>
  apiPost<AuthUser>("/api/auth/register", { name, email, password });

export const patchMe = (name: string) =>
  apiPatch<{ id: number; name: string; initials: string }>("/api/auth/me", {
    name,
  });

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiPost<{ ok: boolean }>("/api/auth/change-password", {
    currentPassword,
    newPassword,
  });

export const forgotPassword = (email: string) =>
  apiPost<{ ok: boolean }>("/api/auth/forgot-password", { email });

export const resetPassword = (token: string, newPassword: string) =>
  apiPost<{ ok: boolean }>("/api/auth/reset-password", { token, newPassword });

export const deleteMyAccount = () =>
  api<{ ok: boolean }>("/api/auth/me", { method: "DELETE" });

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType =
  | "swap_requested"
  | "swap_accepted"
  | "swap_cancelled"
  | "shift_assigned"
  | "shift_cancelled"
  | "nights_added"
  | "nights_published"
  | "mentioned"
  | "night_cancelled";

export type ApiNotification = {
  id: number;
  member_id: number;
  type: NotificationType;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export const getNotifications = () =>
  api<{ notifications: ApiNotification[]; unreadCount: number }>(
    "/api/notifications",
  );

export const markNotificationRead = (id: number) =>
  apiPatch<{ ok: boolean }>(`/api/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  apiPatch<{ ok: boolean }>("/api/notifications/read-all");

export const markNotificationsReadByLink = (link: string) =>
  apiPatch<{ ok: boolean }>("/api/notifications/read-by-link", { link });

// ── Email preferences ───────────────────────────────────────────────────────────

export type ApiEmailPrefs = {
  email_on_mention: boolean;
  email_on_nights: boolean;
  email_on_shift: boolean;
  needs_consent?: boolean;
};

export const getEmailPrefs = () => api<ApiEmailPrefs>("/api/auth/email-prefs");

export const patchEmailPrefs = (
  prefs: Partial<ApiEmailPrefs> & { consent_confirmed?: boolean },
) => apiPatch<{ ok: boolean }>("/api/auth/email-prefs", prefs);

// ── Vagter page ───────────────────────────────────────────────────────────────

export type ApiVagterSettings = {
  door_code: string;
  locker_code: string;
  shift_note: string;
};

export type ApiChecklistItem = {
  id: number;
  text: string;
  sort_order: number;
  is_header: boolean;
};

export type ApiVagterPageData = {
  settings: ApiVagterSettings;
  checklist: ApiChecklistItem[];
};

export const getVagterPageData = () => api<ApiVagterPageData>("/api/vagter");

export const updateVagterSettings = (patch: Partial<ApiVagterSettings>) =>
  apiPut<{ ok: boolean }>("/api/vagter/settings", patch);

export const addChecklistItem = (
  text: string,
  sort_order?: number,
  is_header?: boolean,
) =>
  apiPost<ApiChecklistItem>("/api/vagter/checklist", {
    text,
    sort_order,
    is_header,
  });

export const updateChecklistItem = (
  id: number,
  patch: { text?: string; sort_order?: number; is_header?: boolean },
) => apiPatch<ApiChecklistItem>(`/api/vagter/checklist/${id}`, patch);

export const deleteChecklistItem = (id: number) =>
  apiDelete<{ ok: boolean }>(`/api/vagter/checklist/${id}`);

// ── Channel Members ───────────────────────────────────────────────────────────

export type ApiChannelMember = {
  id: number;
  name: string;
  initials: string;
  has_avatar?: boolean;
};

export const getChannelMembers = (channelId: number) =>
  api<ApiChannelMember[]>(`/api/channels/${channelId}/members`);

// ── Audit Log ────────────────────────────────────────────────────────────────

export type AuditLogRow = {
  id: number;
  event_type: string;
  actor_member_id: number | null;
  actor_email: string | null;
  actor_name: string | null;
  target_member_id: number | null;
  target_email: string | null;
  target_name: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
};

export type AuditLogFilters = {
  eventType?: string;
  actorEmail?: string;
  targetEmail?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export const getAuditLog = (filters: AuditLogFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.eventType) params.set("eventType", filters.eventType);
  if (filters.actorEmail) params.set("actorEmail", filters.actorEmail);
  if (filters.targetEmail) params.set("targetEmail", filters.targetEmail);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.search) params.set("search", filters.search);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return api<{
    rows: AuditLogRow[];
    total: number;
    page: number;
    limit: number;
  }>(`/api/audit-log${qs ? `?${qs}` : ""}`);
};

export const getAuditLogEventTypes = () =>
  api<string[]>("/api/audit-log/event-types");

export const getSilence = () =>
  api<{ silenced: boolean }>("/api/audit-log/silence");

export const setSilence = (silenced: boolean) =>
  api<{ silenced: boolean }>("/api/audit-log/silence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ silenced }),
  });

// ── iCal ─────────────────────────────────────────────────────────────────────

/** Fetch existing personal iCal feed token (null if not yet generated). */
export const getIcalToken = () =>
  api<{ token: string | null }>("/api/auth/ical-token");

/** Generate (or return existing) personal iCal feed token. */
export const postIcalToken = () =>
  apiPost<{ token: string }>("/api/auth/ical-token");

/** Revoke personal iCal feed token. */
export const deleteIcalToken = () =>
  api<{ ok: boolean }>("/api/auth/ical-token", { method: "DELETE" });

// ── Board Games ───────────────────────────────────────────────────────────────

export type ApiBoardgame = {
  bgg_id: number;
  name: string;
  avg_weight: number | null;
  min_players: number | null;
  max_players: number | null;
  year_published: number | null;
  playing_time: number | null;
  owners: { name: string | null }[];
};

export type ApiBggPrefs = {
  bgg_share_collection: boolean;
  bgg_share_name: boolean;
  game_count: number;
};

export const getBoardgames = () => api<ApiBoardgame[]>("/api/boardgames");

/** Upload a BGG collection CSV file. Accepts the already-read CSV text and sends it as JSON. */
export function uploadBggCollection(
  csvText: string,
): Promise<{ ok: boolean; imported: number; removed: number }> {
  return api<{ ok: boolean; imported: number; removed: number }>(
    "/api/boardgames/upload",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText }),
    },
  );
}

export const getBggPrefs = () => api<ApiBggPrefs>("/api/auth/bgg-prefs");

export const patchBggPrefs = (prefs: Partial<ApiBggPrefs>) =>
  apiPatch<{ ok: boolean }>("/api/auth/bgg-prefs", prefs);

// ── Avatar ───────────────────────────────────────────────────────────────────

/**
 * Upload a cropped avatar image. Sends as multipart/form-data so we bypass
 * the JSON Content-Type header set by the default `api()` wrapper.
 */
export async function uploadAvatar(
  blob: Blob,
): Promise<{ ok: boolean; size: number }> {
  const form = new FormData();
  form.append("image", blob, "avatar.jpg");
  const res = await fetch(`${BASE}/api/members/me/avatar`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    if (res.status === 401)
      window.dispatchEvent(new Event("auth:unauthorized"));
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const deleteAvatar = () =>
  apiDelete<{ ok: boolean }>("/api/members/me/avatar");
