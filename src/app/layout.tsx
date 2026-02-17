import type { Metadata } from "next";
import type { ReactNode } from "react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import "../index.css";
import { Providers } from "./providers";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Rush PCCM Calendar Assistant",
  description: "Rush PCCM calendar planning and scheduling administration",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const initialAuth = await withAuth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers initialAuth={initialAuth}>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
