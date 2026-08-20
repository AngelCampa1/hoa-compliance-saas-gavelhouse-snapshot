# Asset Inventory

All paths are relative to this folder unless noted.

## Generated Logo Assets

- `assets/logos/gavelhouse-icon-240.png` - Product Hunt thumbnail, 240x240 PNG.
- `assets/logos/gavelhouse-icon-400.png` - G2 profile logo minimum, 400x400 PNG.
- `assets/logos/gavelhouse-icon-1024.png` - directory square logo, 1024x1024 PNG.
- `assets/logos/gavelhouse-logo-light-1000x352.png` - full wordmark logo,
  1000x352 PNG with transparent background.
- `assets/logos/gavelhouse-logo-light.svg` - same logomark and layout as
  `apps/web/public/logo-light.svg`, but with the "Gavelhouse" wordmark
  outlined to vector paths instead of live `<text>`. This copy is handed to
  external sites (G2, Product Hunt, etc.) that may not load the Public Sans
  webfont, so outlined paths render identically everywhere instead of
  depending on font fallback. Regenerate both this file and the identical
  copy at `docs/getting-badges/assets/logos/gavelhouse-logo-light.svg`
  together if the wordmark or mark artwork changes.
- `assets/logos/gavelhouse-favicon.svg` - copied from
  `apps/web/public/favicon.svg`.
- `assets/gavelhouse-og-default.png` - copied from
  `apps/web/public/og-default.png`, 1200x630 PNG.
- `assets/g2-banner-1260x240.png` - generated G2 profile banner, 1260x240 PNG.
- `assets/g2-banner-2500x476.png` - generated larger G2 profile banner
  fallback, 2500x476 PNG.

## Product Hunt Gallery

Product Hunt recommends gallery images at 1270x760 and requires at least two
gallery images before the launch page gallery is viewable.

- `assets/product-hunt/01-dashboard-1270x760.png`
- `assets/product-hunt/02-reserve-funds-1270x760.png`
- `assets/product-hunt/03-governance-1270x760.png`
- `assets/product-hunt/04-reports-1270x760.png`
- `assets/product-hunt/05-billing-1270x760.png`

## General Screenshot Set

Use these for SaaSHub, AlternativeTo, G2, and any form that accepts standard
product screenshots.

- `assets/screenshots/finance-reserves-1440.png`
- `assets/screenshots/governance-meetings-1440.png`
- `assets/screenshots/reports-balance-sheet-1440.png`

## Platform Mapping

| Platform      | Use                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------- |
| SaaSHub       | 1024 logo, reserve funds, governance, reports                                             |
| AlternativeTo | 1024 logo or SVG, reserve funds, governance, reports                                      |
| Product Hunt  | 240 thumbnail, all 1270x760 gallery images                                                |
| G2            | 400 profile logo, SVG grid logo, 1260x240 banner, 2500x476 fallback banner, 3 screenshots |
| BetaList      | 1024 logo, reserve funds screenshot, OG image if a banner is requested                    |

## Missing Account-Only / External Assets

- TODO: public YouTube demo video URL. Product Hunt only supports YouTube links
  for uploaded videos, and the video must not be private.
- TODO: Product Hunt maker username.
- TODO: G2 vendor/admin claim confirmation after listing creation.
- TODO: Final SaaSHub domain verification inbox.
