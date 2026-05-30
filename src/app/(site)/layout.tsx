import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
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
      <EmailConsentModal />
    </UserSSEWrapper>
  );
}
