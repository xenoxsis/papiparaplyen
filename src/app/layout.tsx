import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { OneSignalProvider } from "@/components/OneSignalProvider";
import { Toaster } from "sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Esbjerg Brætspil - Brætspilsklub",
  description: "Velkommen til Esbjerg Brætspil brætspilsklub",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#c0392b" />
      </head>
      <body className={inter.variable}>
        <AuthProvider>
          <OneSignalProvider />
          {children}
        </AuthProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
