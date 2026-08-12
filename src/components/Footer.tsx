interface FooterLink {
  label: string;
  url: string;
}

interface FooterProps {
  companyLinks?: FooterLink[];
  servicesLinks?: FooterLink[];
  supportLinks?: FooterLink[];
  copyright?: string;
}

export default function Footer({
  companyLinks = [
    { label: "About Us", url: "/about" },
    { label: "Contact", url: "/contact" },
  ],
  servicesLinks = [
    { label: "SMS Verification", url: "/" },
    { label: "Virtual Numbers", url: "/" },
  ],
  supportLinks = [
    { label: "FAQ", url: "/faq" },
    { label: "Support Ticket", url: "/support" },
    { label: "WhatsApp Status", url: "/status" },
  ],
  copyright = "© 2026 SWIFTVERIFY.NG. All Rights Reserved.",
}: FooterProps) {
  return (
    <footer className="border-t border-gray-200 mt-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xs font-bold tracking-wider text-gray-900 mb-4">
              COMPANY
            </h3>
            <ul className="space-y-2">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.url}
                    className="text-sm text-gray-600 hover:text-red-600"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold tracking-wider text-gray-900 mb-4">
              SERVICES
            </h3>
            <ul className="space-y-2">
              {servicesLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.url}
                    className="text-sm text-gray-600 hover:text-red-600"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold tracking-wider text-gray-900 mb-4">
              SUPPORT
            </h3>
            <ul className="space-y-2">
              {supportLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.url}
                    className="text-sm text-gray-600 hover:text-red-600"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col items-start md:items-end gap-3">
            <div className="flex items-center gap-3">
              {/* Payment logos placeholders */}
              <span className="text-xs font-semibold text-gray-500 border px-2 py-1 rounded">
                Paystack
              </span>
              <span className="text-xs font-semibold text-gray-500 border px-2 py-1 rounded">
                Monnify
              </span>
            </div>
            <p className="text-xs text-gray-500 text-right max-w-[200px]">
              {copyright}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
