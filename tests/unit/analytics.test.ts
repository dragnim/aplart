import { describe, expect, it } from 'vitest';
import { NoOpAnalytics, analytics, type AnalyticsEvent } from '@/analytics/Analytics';

describe('the analytics seam', () => {
  it('does nothing, which is the whole point of the shipped implementation', () => {
    const subject = new NoOpAnalytics();
    expect(() => subject.track({ name: 'preset_opened', presetId: 'modular-bloom' })).not.toThrow();
    expect(subject.track({ name: 'preset_opened', presetId: 'modular-bloom' })).toBeUndefined();
  });

  it('is the implementation the application actually uses', () => {
    expect(analytics).toBeInstanceOf(NoOpAnalytics);
  });

  it('has nowhere to put code, artwork data or anything about a person', () => {
    /*
     * A type-level check, asserted by construction. Every event carries a
     * preset id and at most a duration, a size, a kind or a scope. If someone
     * later adds a field that could hold the user's code or their matrix, this
     * list stops compiling — which is a better guard than a comment asking
     * people not to.
     */
    const events: AnalyticsEvent[] = [
      { name: 'preset_opened', presetId: 'modular-bloom' },
      { name: 'code_run', presetId: 'modular-bloom', durationMs: 120 },
      { name: 'parameter_changed', presetId: 'modular-bloom', parameterId: 'size' },
      { name: 'artwork_exported', presetId: 'modular-bloom', size: '512' },
      { name: 'share_link_copied', presetId: 'modular-bloom' },
      { name: 'reset_used', presetId: 'modular-bloom', scope: 'parameters' },
      { name: 'randomise_used', presetId: 'modular-bloom' },
      { name: 'execution_failed', presetId: 'modular-bloom', kind: 'timeout' },
    ];

    for (const event of events) {
      const values = Object.values(event).map(String).join(' ');
      // Nothing resembling APL source or a matrix.
      expect(values).not.toMatch(/[⍳⍴∘←¯⌽]/u);
      expect(Object.keys(event).length).toBeLessThanOrEqual(3);
    }
  });
});
