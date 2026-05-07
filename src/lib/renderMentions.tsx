import React from "react";

const MENTION_RE = /@\[([^\]]+)\]\((\d+)\)/g;

/**
 * Parses a message body and returns a React node with @mentions rendered
 * as highlighted inline chips.
 *
 * Mention syntax stored in the database: @[Name](memberId)
 */
export function renderMessageBody(
  body: string,
  currentUserId: number,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset lastIndex in case the regex is reused across calls
  MENTION_RE.lastIndex = 0;

  while ((match = MENTION_RE.exec(body)) !== null) {
    const [full, name, idStr] = match;
    const mentionedId = Number(idStr);
    const start = match.index;

    // Plain text before this mention
    if (start > lastIndex) {
      parts.push(body.slice(lastIndex, start));
    }

    const isSelf = mentionedId === currentUserId;
    parts.push(
      <span
        key={`mention-${start}`}
        className={`inline-block rounded px-1 py-0 font-medium text-[0.85em] ${
          isSelf ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-700"
        }`}
      >
        @{name}
      </span>,
    );

    lastIndex = start + full.length;
  }

  // Remaining plain text
  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  // If nothing was parsed (no mentions), return the original string
  if (parts.length === 0) return body;

  return <>{parts}</>;
}

/** Extract mentioned member IDs from a message body. */
export function extractMentionIds(body: string): number[] {
  const ids: number[] = [];
  MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(body)) !== null) {
    ids.push(Number(match[2]));
  }
  return ids;
}
