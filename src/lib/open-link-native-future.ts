/**
 * Optional future hooks for Apple Universal Links / Android App Links.
 *
 * Do NOT publish real Team ID / package names until the native apps ship.
 * When ready:
 * 1. Replace placeholders in these JSON files.
 * 2. Confirm files are served at:
 *    - https://lookcruise.com/.well-known/apple-app-site-association
 *    - https://lookcruise.com/.well-known/assetlinks.json
 * 3. Include path `/open` (and any deep paths) in the association.
 * 4. Wire LOOK_IOS_APP_STORE_URL / LOOK_ANDROID_PLAY_STORE_URL and update
 *    `resolveOpenDestination` in `src/lib/open-link.ts`.
 *
 * Until then, `/open` only redirects to the web app.
 */

export const OPEN_LINK_FUTURE = {
  appleAppSiteAssociationPaths: ["/open", "/open/*"],
  androidAssetLinksPaths: ["/open", "/open/*"],
  notes:
    "AASA and assetlinks are intentionally not published yet — no App Store / Play listing.",
} as const;
