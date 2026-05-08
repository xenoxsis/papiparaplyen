const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let token: string | null = null;
  try {
    token =
      typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  } catch {
    /* ignore */
  }

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (!res.ok) {
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

// ── Types ────────────────────────────────────────────────────────────────────

export type ApiMember = {
  id: number;
  name: string;
  initials: string;
  email: string;
  joined_date: string;
  banned: boolean;
  roles: string[];
};

export type ApiClubNight = {
  id: number;
  number: number;
  name: string;
  date: string;
  time_from: string;
  time_to: string;
  location: string;
  vagt_member_id: number | null;
  assigned_member_name: string | null;
  assigned_member_initials: string | null;
  opted_out_members: { id: number; name: string; initials: string }[];
  vagt_confirmed: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiScheduleReview = {
  id: number;
  member_id: number;
  reviewed_at: string;
  member_name: string | null;
  member_initials: string | null;
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
  token: string;
};

// ── Members ──────────────────────────────────────────────────────────────────

export const getMembers = () => api<ApiMember[]>("/api/members");
export const getMember = (id: number) => api<ApiMember>(`/api/members/${id}`);
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

export const getClubNights = () => api<ApiClubNight[]>("/api/club-nights");
export const postClubNight = (body: Partial<ApiClubNight>) =>
  apiPost<ApiClubNight>("/api/club-nights", body);
export const patchClubNight = (id: number, body: Partial<ApiClubNight>) =>
  apiPatch<ApiClubNight>(`/api/club-nights/${id}`, body);
export const deleteClubNight = (id: number) =>
  apiDelete<{ ok: boolean }>(`/api/club-nights/${id}`);
export const postClubNightOptOut = (nightId: number) =>
  apiPost<{ ok: boolean }>(`/api/club-nights/${nightId}/opt-out`);
export const deleteClubNightOptOut = (nightId: number) =>
  apiDelete<{ ok: boolean }>(`/api/club-nights/${nightId}/opt-out`);
export const postClubNightConfirm = (nightId: number) =>
  apiPost<ApiClubNight>(`/api/club-nights/${nightId}/confirm`);

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

// ── Auth ──────────────────────────────────────────────────────────────────────

export const postLogin = (email: string, password: string) =>
  apiPost<AuthUser>("/api/auth/login", { email, password });

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

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType =
  | "swap_requested"
  | "swap_accepted"
  | "swap_cancelled"
  | "shift_assigned"
  | "nights_added"
  | "mentioned";

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

// ── Email preferences ───────────────────────────────────────────────────────────

export type ApiEmailPrefs = {
  email_on_mention: boolean;
  email_on_nights: boolean;
  email_on_shift: boolean;
};

export const getEmailPrefs = () => api<ApiEmailPrefs>("/api/auth/email-prefs");

export const patchEmailPrefs = (prefs: Partial<ApiEmailPrefs>) =>
  apiPatch<{ ok: boolean }>("/api/auth/email-prefs", prefs);

// ── Channel Members ───────────────────────────────────────────────────────────

export type ApiChannelMember = {
  id: number;
  name: string;
  initials: string;
};

export const getChannelMembers = (channelId: number) =>
  api<ApiChannelMember[]>(`/api/channels/${channelId}/members`);
