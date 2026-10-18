/* ======================================================================
 * APP NAME – change this (and the strings below) to rename the product.
 * Used by: web UI, PWA manifest (vite.config.ts imports this), server
 * logs, README, Docker labels. Repo name follows APP_SLUG.
 * ====================================================================== */
export const APP_NAME = 'Merkster';
export const APP_SLUG = 'merkster';           // npm package, cookie prefix, localStorage / IndexedDB keys, Docker image
export const APP_TAGLINE_EN = 'Snap it. Drill it. Own the test. Earn the reward.';
export const APP_TAGLINE_DE = 'Knipsen. Draufhaben. Test rocken. Belohnung holen.';
export const APP_COOKIE = 'mk_sid';          // rename with APP_SLUG if you want (must match server auth)
export const APP_CSRF_HEADER = 'x-merkster'; // custom header; change with APP_SLUG
export const APP_DB = 'merkster';            // IndexedDB database name
export const APP_VERSION = '0.1.2';
