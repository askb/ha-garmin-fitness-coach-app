import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_SERVER = "http://127.0.0.1:8099";
const IS_ADDON = process.env.NODE_ENV === "production";

// ── Mock responses for local development ────────────────────────────────────
const mockStatus = {
  connected: false,
  email: "",
  lastSync: "",
};

function mockLogin(body: { email?: string; password?: string }) {
  if (!body.email || !body.password) {
    return NextResponse.json(
      { success: false, message: "Email and password are required" },
      { status: 400 },
    );
  }
  mockStatus.connected = true;
  mockStatus.email = body.email;
  mockStatus.lastSync = new Date().toISOString();
  return NextResponse.json({ success: true, needsMfa: false });
}

function mockMfa() {
  return NextResponse.json({ success: true });
}

// ── Proxy helpers ───────────────────────────────────────────────────────────
async function proxyPost(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

async function proxyGet(url: string) {
  const res = await fetch(url);
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// ── Route handlers ──────────────────────────────────────────────────────────

/** GET /api/garmin/auth — connection status */
export async function GET() {
  if (!IS_ADDON) {
    return NextResponse.json(mockStatus);
  }
  return proxyGet(`${AUTH_SERVER}/auth/status`);
}

/** POST /api/garmin/auth — login or MFA verification */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    email?: string;
    password?: string;
    code?: string;
  };

  if (!IS_ADDON) {
    if (body.code) return mockMfa();
    return mockLogin(body);
  }

  if (body.code) {
    return proxyPost(`${AUTH_SERVER}/auth/mfa`, { code: body.code });
  }
  return proxyPost(`${AUTH_SERVER}/auth/login`, {
    email: body.email,
    password: body.password,
  });
}

/** DELETE /api/garmin/auth — logout / disconnect */
export async function DELETE() {
  if (!IS_ADDON) {
    mockStatus.connected = false;
    mockStatus.email = "";
    mockStatus.lastSync = "";
    return NextResponse.json({ success: true });
  }
  return proxyPost(`${AUTH_SERVER}/auth/logout`, {});
}

/** PUT /api/garmin/auth — import pre-generated tokens */
export async function PUT(req: NextRequest) {
  if (!IS_ADDON) {
    mockStatus.connected = true;
    mockStatus.email = "imported@garmin.com";
    mockStatus.lastSync = new Date().toISOString();
    return NextResponse.json({ success: true });
  }
  const body = (await req.json()) as {
    oauth1_token?: unknown;
    oauth2_token?: unknown;
  };
  return proxyPost(`${AUTH_SERVER}/auth/import-tokens`, body);
}
