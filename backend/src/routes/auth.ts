import bcrypt from "bcrypt";
import { Router } from "express";
import { readTable, writeTable } from "../db";

const SALT_ROUNDS = 12;

const router = Router();

interface DbUser {
  id: number;
  email: string;
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

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  const members = readTable<DbMember>("members");
  const member = members.find(
    (m) => m.email.toLowerCase() === email.toLowerCase(),
  );
  if (!member) return res.status(401).json({ error: "Invalid credentials" });

  const users = readTable<DbUser>("users");
  const user = users.find((u) => u.member_id === member.id);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (user.banned) return res.status(403).json({ error: "Account banned" });

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch)
    return res.status(401).json({ error: "Invalid credentials" });

  const memberRoles = readTable<DbMemberRole>("member_roles");
  const roles = readTable<DbRole>("roles");
  const roleNames = memberRoles
    .filter((mr) => mr.member_id === member.id)
    .map((mr) => roles.find((r) => r.id === mr.role_id)?.name)
    .filter(Boolean) as string[];

  return res.json({
    id: member.id,
    name: member.name,
    initials: member.initials,
    roles: roleNames,
  });
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password required" });
  }

  const members = readTable<DbMember>("members");
  if (members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const users = readTable<DbUser>("users");

  // Derive initials from name
  const parts = (name as string).trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();

  const newMemberId = members.length
    ? Math.max(...members.map((m) => m.id)) + 1
    : 1;
  const newUserId = users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1;
  const today = new Date().toISOString().slice(0, 10);

  const hashedPassword = await bcrypt.hash(password as string, SALT_ROUNDS);

  const newMember: DbMember = {
    id: newMemberId,
    name: (name as string).trim(),
    initials,
    email: (email as string).trim().toLowerCase(),
    joined_date: today,
  };

  const newUser: DbUser = {
    id: newUserId,
    email: (email as string).trim().toLowerCase(),
    password: hashedPassword,
    provider: "local",
    provider_id: null,
    member_id: newMemberId,
    banned: false,
  };

  members.push(newMember);
  users.push(newUser);
  writeTable("members", members);
  writeTable("users", users);

  return res.status(201).json({
    id: newMemberId,
    name: newMember.name,
    initials: newMember.initials,
    roles: [],
  });
});

export default router;
