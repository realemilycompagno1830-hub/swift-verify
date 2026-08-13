interface FooterLink {
  label: string;
  url: string;
}

interface FooterProps {
  companyLinks?: FooterLink[];
  servicesLinks?: FooterLink[];
  supportLinks?: FooterLink[];
  copyright?: string;
  paymentGateways?: string[];
}

export default function Footer({
  companyLinks = [],
  servicesLinks = [],
  supportLinks = [],
  copyright = "© 2026 SWIFTVERIFY.NG. All Rights Reserved.",
  paymentGateways = ["paystack", "monnify"],
}: FooterProps) {
  const hasCompany = companyLinks && companyLinks.length > 0;
  const hasServices = servicesLinks && servicesLinks.length > 0;
  const hasSupport = supportLinks && supportLinks.length > 0;

  const columnCount =
    (hasCompany ? 1 : 0) + (hasServices ? 1 : 0) + (hasSupport ? 1 : 0) + 1;

  return (
    <footer className="border-t border-gray-200 mt-12 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div
          className={`grid gap-8 ${
            columnCount <= 2
              ? "grid-cols-1 sm:grid-cols-2"
              : columnCount === 3
              ? "grid-cols-1 sm:grid-cols-3"
              : "grid-cols-2 md:grid-cols-4"
          }`}
        >
          {hasCompany && (
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
          )}

          {hasServices && (
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
          )}

          {hasSupport && (
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
          )}

          <div className="flex flex-col items-start sm:items-end gap-3">
            {paymentGateways && paymentGateways.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                {paymentGateways.includes("paystack") && (
                  <span className="text-xs font-semibold text-gray-500 border px-2 py-1 rounded">
                    Paystack
                  </span>
                )}
                {paymentGateways.includes("monnify") && (
                  <span className="text-xs font-semibold text-gray-500 border px-2 py-1 rounded">
                    Monnify
                  </span>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500 text-left sm:text-right max-w-[220px]">
              {copyright}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
