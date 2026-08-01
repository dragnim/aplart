/**
 * A seam for analytics, with nothing behind it.
 *
 * No analytics platform ships in this release, and the About page tells
 * visitors there is no tracking. This exists so that adding one later is a
 * change of implementation rather than a change scattered through the
 * interface, and so the event vocabulary is decided once rather than
 * improvised.
 *
 * The call sites are real: the workspace genuinely calls `track` when an
 * artwork is opened, run or fails. A seam that nothing calls is a seam that
 * has silently stopped fitting by the time someone needs it. Since the only
 * implementation does nothing, no data is collected and nothing leaves the
 * device — the About page's claim stays true.
 *
 * Nothing here may ever carry code, artwork data or anything identifying a
 * person. The types enforce that: there is nowhere to put it.
 */

export type AnalyticsEvent =
  | { readonly name: 'preset_opened'; readonly presetId: string }
  | { readonly name: 'code_run'; readonly presetId: string; readonly durationMs: number }
  | { readonly name: 'parameter_changed'; readonly presetId: string; readonly parameterId: string }
  | { readonly name: 'artwork_exported'; readonly presetId: string; readonly size: string }
  | { readonly name: 'share_link_copied'; readonly presetId: string }
  | { readonly name: 'reset_used'; readonly presetId: string; readonly scope: 'parameters' | 'artwork' }
  | { readonly name: 'randomise_used'; readonly presetId: string }
  | { readonly name: 'execution_failed'; readonly presetId: string; readonly kind: string };

export interface Analytics {
  track(event: AnalyticsEvent): void;
}

/** The only implementation that ships. It does nothing, on purpose. */
export class NoOpAnalytics implements Analytics {
  // The parameter is declared even though it is unused: omitting it satisfies
  // the interface but makes the class awkward to call directly, and it is the
  // shape a real implementation has to match.
  track(_event: AnalyticsEvent): void {
    // Intentionally empty.
  }
}

export const analytics: Analytics = new NoOpAnalytics();
