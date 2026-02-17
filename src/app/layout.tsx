import type { Metadata } from "next";
import type { ReactNode } from "react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import "../index.css";
import { Providers } from "./providers";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Rush PCCM Calendar Assistant",
  description: "Rush PCCM calendar planning and scheduling administration",
};

const themeScript = `
(() => {
  try {
    const persistedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    const isThemeValid = persistedTheme === "light" || persistedTheme === "dark";
    const resolvedTheme = isThemeValid
      ? persistedTheme
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.setAttribute("data-theme", resolvedTheme);
  } catch {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const initialAuth = await withAuth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers initialAuth={initialAuth}>{children}</Providers>
      </body>
    </html>
  );
}
