import React from "react";

const MENTION_RE = /@\[([^\]]+)\]\((\d+)\)/g;
// Matches group mentions: @vagter or @alle (word boundary)
const GROUP_MENTION_RE = /@(vagter|alle)\b/g;
// Combined regex for parsing all mention types in order
const ALL_MENTION_RE = /@\[([^\]]+)\]\((\d+)\)|@(vagter|alle)\b/g;

/**
 * Parses a message body and returns a React node with @mentions rendered
 * as highlighted inline chips.
 *
 * Individual mention syntax stored in the database: @[Name](memberId)
 * Group mention syntax: @vagter  @alle
 */
export function renderMessageBody(
  body: string,
  currentUserId: number,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  ALL_MENTION_RE.lastIndex = 0;

  while ((match = ALL_MENTION_RE.exec(body)) !== null) {
    const [full, name, idStr, groupKeyword] = match;
    const start = match.index;

    // Plain text before this mention
    if (start > lastIndex) {
      parts.push(body.slice(lastIndex, start));
    }

    if (groupKeyword) {
      // Group mention: @vagter or @alle
      const isVagter = groupKeyword === "vagter";
      parts.push(
        <span
          key={`gmention-${start}`}
          style={{
            display: "inline-block",
            borderRadius: 4,
            padding: "0 4px",
            fontWeight: 600,
            fontSize: "0.85em",
            backgroundColor: isVagter ? "#dcfce7" : "#fce7f3",
            color: isVagter ? "#166534" : "#9d174d",
          }}
        >
          @{groupKeyword}
        </span>,
      );
    } else {
      // Individual member mention
      const mentionedId = Number(idStr);
      const isSelf = mentionedId === currentUserId;
      parts.push(
        <span
          key={`mention-${start}`}
          style={{
            display: "inline-block",
            borderRadius: 4,
            padding: "0 4px",
            fontWeight: 500,
            fontSize: "0.85em",
            backgroundColor: isSelf ? "#fef9c3" : "#dbeafe",
            color: isSelf ? "#92400e" : "#1d4ed8",
          }}
        >
          @{name}
        </span>,
      );
    }

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

/** Returns true if the message body contains a @vagter group mention. */
export function hasVagterMention(body: string): boolean {
  GROUP_MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GROUP_MENTION_RE.exec(body)) !== null) {
    if (match[1] === "vagter") return true;
  }
  return false;
}

/** Returns true if the message body contains an @alle group mention. */
export function hasAlleMention(body: string): boolean {
  GROUP_MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GROUP_MENTION_RE.exec(body)) !== null) {
    if (match[1] === "alle") return true;
  }
  return false;
}
