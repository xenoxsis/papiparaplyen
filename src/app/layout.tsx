import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { OneSignalProvider } from "@/components/OneSignalProvider";
import { ThemedToaster } from "@/components/ThemedToaster";

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
        {/* Anti-FOUC: apply dark class before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className={inter.variable}>
        <ThemeProvider>
          <AuthProvider>
            <OneSignalProvider />
            {children}
          </AuthProvider>
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
