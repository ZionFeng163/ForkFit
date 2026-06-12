import "server-only";

import { cookies } from "next/headers";

import type { UserInfoResponse } from "@/types/forkfit";

const API_BASE = process.env.FORKFIT_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function getServerUser(): Promise<UserInfoResponse | null> {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: { Cookie: `access_token=${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.json() as Promise<UserInfoResponse>;
  } catch {
    return null;
  }
}
