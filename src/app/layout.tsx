import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LocaleProvider } from "@/components/providers/LocaleProvider";
import { VisitTracker } from "@/components/analytics/VisitTracker";
import { PresenceTracker } from "@/components/analytics/PresenceTracker";
import { getServerTranslation } from "@/lib/i18n/server";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "cyrillic-ext"],
  variable: "--font-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation();
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    manifest: "/manifest.json",
    icons: {
      icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "LOOK",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#6366F1",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getServerTranslation();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${plusJakarta.className} antialiased`}>
        <LocaleProvider initialLocale={locale}>
          <AuthProvider>
            <VisitTracker />
            <PresenceTracker />
            {children}
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
