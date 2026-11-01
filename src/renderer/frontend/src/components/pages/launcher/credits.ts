/**
 * Add one contributor per entry. `@` marks an external link (and requires an
 * `href`); it can be combined with # or $, e.g. `@# Name`. # name = basic
 * pulse, $ name = highlighted shimmer, no prefix = standard.
 */
export interface LauncherCredit {
  entry: string;
  href?: string;
}
