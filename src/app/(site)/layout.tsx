import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { Toaster } from "sonner";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
      <Toaster position="bottom-right" richColors />
    </>
  );
}
