import { inject, Injectable } from '@angular/core';
import { buildMetricsBuckets, currentEpoch, deriveMetricsToken, HatchError } from '@moxy/core';
import { DraftStore } from './draft.store';
import { ProfileSessionStore } from './profile-session.store';

/**
 * The anonymous-counters opt-in. The flag itself is session state
 * (ProfileSessionStore.metricsOptIn, mirrored from PrivData); this store
 * owns when and how a submission fires.
 */
@Injectable({ providedIn: 'root' })
export class MetricsStore {
  private readonly session = inject(ProfileSessionStore);
  private readonly draft = inject(DraftStore);

  /** Epochs this tab already submitted (server dedups for real). */
  private readonly submittedEpochs = new Set<string>();

  /**
   * Toggle the anonymous-counter opt-in. Opting IN submits immediately —
   * the person is present and consenting right now, so instant feedback
   * beats a stealth delay; only recurring monthly re-submissions are
   * decoupled from other traffic (see maybeSubmitMetrics).
   */
  async setMetricsOptIn(on: boolean): Promise<void> {
    const { priv } = this.session.requireSession();
    priv.metricsOptIn = on;
    this.session.metricsOptIn.set(on);
    await this.session.save();
    if (on) await this.submitMetricsNow();
  }

  /**
   * Fire the current epoch's submission if opted in and not yet counted.
   * Called on dashboard visits; recurring submissions ride a random 10–90 s
   * delay so they never sit next to a profile save in the server's logs.
   * `metricsLastEpoch` is only persisted by the NEXT organic save — a
   * duplicate submission is rejected harmlessly server-side.
   */
  maybeSubmitMetrics(): void {
    const priv = this.session.sessionPriv();
    if (!priv?.metricsOptIn) return;
    const epoch = currentEpoch(Date.now());
    if (this.submittedEpochs.has(epoch) || priv.metricsLastEpoch === epoch) return;
    const delay = 10_000 + Math.floor(Math.random() * 80_000);
    setTimeout(() => {
      void this.submitMetricsNow().catch(() => undefined);
    }, delay);
    this.submittedEpochs.add(epoch); // scheduled counts as handled for this tab
  }

  private async submitMetricsNow(): Promise<void> {
    const client = this.session.requireClient();
    const { priv } = this.session.requireSession();
    const viewPhrase = this.session.viewPhrase();
    if (!viewPhrase || !priv.metricsOptIn) return;
    const epoch = currentEpoch(Date.now());
    const buckets = buildMetricsBuckets(this.draft.answers());
    if (buckets.length === 0) return; // no age band answered — nothing to say
    try {
      await client.submitMetrics({
        epoch,
        token: await deriveMetricsToken(viewPhrase),
        buckets,
      });
    } catch (err) {
      // Already counted this epoch — exactly the goal.
      if (!(err instanceof HatchError && err.failure.kind === 'conflict')) throw err;
    }
    this.submittedEpochs.add(epoch);
    priv.metricsLastEpoch = epoch; // rides the next organic save
  }
}
