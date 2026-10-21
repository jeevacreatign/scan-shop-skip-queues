import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { ButtonLink } from "./ui-kit";

const NAV = [
  { to: "/how-it-works", label: "How It Works" },
  { to: "/features", label: "Features" },
  { to: "/retailers", label: "For Retailers" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function Logo({ className = "h-9" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center font-heading text-xl font-bold tracking-tight text-navy ${className}`}
      aria-label="QARTUNO — Scan. Pay. Go."
    >
      QARTUNO
    </span>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="bg-navy text-navy-foreground">
        <p className="container-site py-2 text-center text-xs md:text-sm">
          Smarter supermarket shopping starts here.
        </p>
      </div>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="container-site flex h-16 items-center justify-between gap-4">
          <Link to="/" aria-label="QARTUNO home" onClick={() => setOpen(false)}>
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary"
                activeProps={{ className: "text-primary" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ButtonLink to="/contact" size="sm" className="hidden sm:inline-flex">
              Book a Demo
            </ButtonLink>
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-lg border lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Mobile" className="border-t bg-background lg:hidden">
            <div className="container-site flex flex-col py-3">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-3 font-medium hover:bg-muted"
                >
                  {n.label}
                </Link>
              ))}
              <Link
                to="/faq"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 font-medium hover:bg-muted"
              >
                FAQ
              </Link>
              <ButtonLink to="/contact" className="mt-2">
                Book a Demo
              </ButtonLink>
            </div>
          </nav>
        )}
      </header>
    </>
  );
}

export function SiteFooter() {
  const cols = [
    {
      title: "Product",
      links: [
        ["/how-it-works", "How It Works"],
        ["/features", "Features"],
        ["/shoppers", "For Shoppers"],
        ["/faq", "FAQ"],
      ],
    },
    {
      title: "Retailers",
      links: [
        ["/retailers", "For Retailers"],
        ["/pricing", "Pricing"],
        ["/contact", "Book a Demo"],
      ],
    },
    {
      title: "Company",
      links: [
        ["/about", "About Us"],
        ["/contact", "Contact"],
        ["/privacy", "Privacy Policy"],
        ["/terms", "Terms and Conditions"],
      ],
    },
  ];
  return (
    <footer className="border-t bg-muted">
      <div className="container-site grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo className="h-10" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            A smartphone-based scan-and-pay checkout platform for supermarkets in India.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-foreground">{c.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([to, label]) => (
                <li key={label}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Link to={to as any} className="text-sm text-muted-foreground hover:text-primary">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="container-site flex flex-col justify-between gap-2 py-5 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} QARTUNO. All rights reserved.</p>
          <p className="tagline text-base">Scan. Pay. Go.</p>
        </div>
      </div>
    </footer>
  );
}
