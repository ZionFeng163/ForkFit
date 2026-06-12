import { redirect } from "next/navigation";

import { AuthPage } from "@/components/auth-page";
import { getSafeReturnTo } from "@/lib/auth-navigation";
import { getServerUser } from "@/lib/server-auth";

type RegisterPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function RegisterPage({ params, searchParams }: RegisterPageProps) {
  const [{ locale }, query, user] = await Promise.all([
    params,
    searchParams,
    getServerUser(),
  ]);

  if (user) {
    redirect(`/${locale}${getSafeReturnTo(query.returnTo ?? null)}`);
  }

  return <AuthPage defaultTab="register" />;
}
