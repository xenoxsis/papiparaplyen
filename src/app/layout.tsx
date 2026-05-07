import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pap i Paraplyen - Brætspilsklub",
  description: "Velkommen til Pap i Paraplyen brætspilsklub",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <body className={inter.variable}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
