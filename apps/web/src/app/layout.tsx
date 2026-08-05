import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { MealPlanProvider } from "@/components/meal-plan-provider";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "吃什么 · ForkFit",
  description: "发现真实菜谱，并按你的口味、时间和饮食限制定制做法。",
  icons: {
    icon: [
      { url: "/brand-mark.svg", type: "image/svg+xml" },
      { url: "/brand-mark-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand-mark-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand-mark-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full">
        <QueryProvider>
          <AuthProvider>
            <MealPlanProvider>{children}</MealPlanProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
