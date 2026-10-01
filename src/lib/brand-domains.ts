const BRAND_DOMAINS: Record<string, string> = {
  affirm: "affirm.com",
  afterpay: "afterpay.com",
  zip: "zip.co",
  fjallraven: "fjallraven.com",
  "fjällräven": "fjallraven.com",
  patagonia: "patagonia.com",
  haglofs: "haglofs.com",
  "haglöfs": "haglofs.com",
  catl: "catl.com",
  "lg energy solution": "lgensol.com",
  panasonic: "panasonic.com",
};

/** Known domain for a competitor brand name, for sourcing a real logo. Undefined falls back to initials. */
export function domainForBrand(brand: string): string | undefined {
  return BRAND_DOMAINS[brand.trim().toLowerCase()];
}
