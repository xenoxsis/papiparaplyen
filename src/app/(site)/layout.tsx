import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { Toaster } from "sonner";
import { UserSSEWrapper } from "@/components/UserSSEWrapper";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserSSEWrapper>
      <Nav />
      {children}
      <Footer />
      <Toaster position="bottom-right" richColors />
    </UserSSEWrapper>
  );
}
