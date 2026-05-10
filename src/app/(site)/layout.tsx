import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { Toaster } from "sonner";
import { UserSSEWrapper } from "@/components/UserSSEWrapper";
import EmailConsentModal from "@/components/EmailConsentModal";

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
      <EmailConsentModal />
    </UserSSEWrapper>
  );
}
