import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { UserSSEWrapper } from "@/components/UserSSEWrapper";
import EmailConsentModal from "@/components/EmailConsentModal";
import PageViewTracker from "@/components/PageViewTracker";

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
      <PageViewTracker />
    </UserSSEWrapper>
  );
}
