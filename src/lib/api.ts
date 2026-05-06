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
  api<ApiMember>(`/api/members/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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
  api<ApiClubNight>("/api/club-nights", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const patchClubNight = (id: number, body: Partial<ApiClubNight>) =>
  api<ApiClubNight>(`/api/club-nights/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const deleteClubNight = (id: number) =>
  api<{ ok: boolean }>(`/api/club-nights/${id}`, { method: "DELETE" });
export const postClubNightOptOut = (nightId: number) =>
  api<{ ok: boolean }>(`/api/club-nights/${nightId}/opt-out`, {
    method: "POST",
  });
export const deleteClubNightOptOut = (nightId: number) =>
  api<{ ok: boolean }>(`/api/club-nights/${nightId}/opt-out`, {
    method: "DELETE",
  });
export const postClubNightConfirm = (nightId: number) =>
  api<ApiClubNight>(`/api/club-nights/${nightId}/confirm`, { method: "POST" });

// ── Schedule Reviews ──────────────────────────────────────────────────────────

export const postScheduleReview = () =>
  api<{ ok: boolean; reviewed_at: string }>("/api/schedule-reviews", {
    method: "POST",
  });
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
  api<ApiMessage>(`/api/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ sender_id, body, ...extra }),
  });
export const patchMessage = (
  channelId: number,
  messageId: number,
  patch: Partial<
    Pick<ApiMessage, "body" | "swap_status" | "taken_by_member_id">
  >,
) =>
  api<ApiMessage>(`/api/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

// ── Auth ──────────────────────────────────────────────────────────────────────

export const postLogin = (email: string, password: string) =>
  api<AuthUser>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const postRegister = (name: string, email: string, password: string) =>
  api<AuthUser>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
