import { Router } from "express";
import { readTable, writeTable } from "../db";
import { requireAdmin } from "../auth";

const router = Router();

interface DbUser {
  id: number;
  username: string;
  password: string;
  provider: string;
  provider_id: string | null;
  member_id: number;
  banned: boolean;
}

interface DbMember {
  id: number;
  name: string;
  initials: string;
  email: string;
  joined_date: string;
}

interface DbMemberRole {
  member_id: number;
  role_id: number;
}

interface DbRole {
  id: number;
  name: string;
}

interface DbClubNight {
  id: number;
  number: number;
  name: string;
  date: string;
  time_from: string;
  time_to: string;
  location: string;
  vagt_member_id: number | null;
  vagt_confirmed: boolean;
}

function enrichMember(
  m: DbMember,
  memberRoles: DbMemberRole[],
  roles: DbRole[],
  users: DbUser[],
) {
  const roleNames = memberRoles
    .filter((mr) => mr.member_id === m.id)
    .map((mr) => roles.find((r) => r.id === mr.role_id)?.name)
    .filter(Boolean) as string[];
  const user = users.find((u) => u.member_id === m.id);
  return { ...m, roles: roleNames, banned: user?.banned ?? false };
}

// GET /api/members
router.get("/", (_req, res) => {
  const members = readTable<DbMember>("members");
  const memberRoles = readTable<DbMemberRole>("member_roles");
  const roles = readTable<DbRole>("roles");
  const users = readTable<DbUser>("users");
  res.json(members.map((m) => enrichMember(m, memberRoles, roles, users)));
});

// GET /api/members/:id
router.get("/:id", (req, res) => {
  const members = readTable<DbMember>("members");
  const memberRoles = readTable<DbMemberRole>("member_roles");
  const roles = readTable<DbRole>("roles");
  const users = readTable<DbUser>("users");
  const member = members.find((m) => m.id === Number(req.params.id));
  if (!member) return res.status(404).json({ error: "Not found" });
  return res.json(enrichMember(member, memberRoles, roles, users));
});

// PATCH /api/members/:id  — update banned
router.patch("/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const members = readTable<DbMember>("members");
  const idx = members.findIndex((m) => m.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const users = readTable<DbUser>("users");
  if (typeof req.body.banned === "boolean") {
    const userIdx = users.findIndex((u) => u.member_id === members[idx].id);
    if (userIdx !== -1) {
      users[userIdx].banned = req.body.banned;
      writeTable("users", users);
    }
  }
  const memberRoles = readTable<DbMemberRole>("member_roles");
  const roles = readTable<DbRole>("roles");
  return res.json(enrichMember(members[idx], memberRoles, roles, users));
});

// PUT /api/members/:id/roles  — replace roles (Vagt / Administrator only)
router.put("/:id/roles", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const newRoleNames: string[] = req.body.roles ?? [];
  const members = readTable<DbMember>("members");
  const member = members.find((m) => m.id === Number(req.params.id));
  if (!member) return res.status(404).json({ error: "Not found" });

  const roles = readTable<DbRole>("roles");
  const memberRoles = readTable<DbMemberRole>("member_roles");

  // Remove existing Vagt/Admin rows for this member
  const filtered = memberRoles.filter(
    (mr) =>
      !(
        mr.member_id === member.id &&
        roles.find(
          (r) =>
            r.id === mr.role_id &&
            (r.name === "Vagt" || r.name === "Administrator"),
        )
      ),
  );

  // Add new rows
  for (const name of newRoleNames) {
    const role = roles.find((r) => r.name === name);
    if (role) filtered.push({ member_id: member.id, role_id: role.id });
  }

  writeTable("member_roles", filtered);

  const updatedRoles = filtered
    .filter((mr) => mr.member_id === member.id)
    .map((mr) => roles.find((r) => r.id === mr.role_id)?.name)
    .filter(Boolean) as string[];

  return res.json({ ...member, roles: updatedRoles });
});

// GET /api/members/:id/shifts  — upcoming club nights where vagt_member_id = id
router.get("/:id/shifts", (req, res) => {
  const memberId = Number(req.params.id);
  const nights = readTable<DbClubNight>("club_nights");
  const members = readTable<DbMember>("members");
  const today = new Date().toISOString().slice(0, 10);

  const shifts = nights
    .filter(
      (n) =>
        n.vagt_member_id === memberId &&
        n.vagt_confirmed === true &&
        n.date >= today,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((n) => {
      const vagt = n.vagt_member_id
        ? members.find((m) => m.id === n.vagt_member_id)
        : null;
      return {
        ...n,
        assigned_member_name: vagt?.name ?? null,
        assigned_member_initials: vagt?.initials ?? null,
      };
    });

  res.json(shifts);
});

export default router;
