import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  currentEpoch,
  debiasDesireRate,
  getItem,
  getSection,
  itemLabel,
  optionLabels,
  type MetricsRecord,
} from '@moxy/core';
import { errorText } from '@moxy/ui';
import { DraftStore } from '../stores/draft.store';
import { ProfileSessionStore } from '../stores/profile-session.store';
import { ServerConfigStore } from '../stores/server-config.store';

interface RateRow {
  readonly label: string;
  readonly pct: number;
  readonly n: number;
}

/**
 * The public aggregate: what opted-in creatures look like this month.
 * Everything shown is a k-floored counter; desire rates are debiased
 * randomized-response estimates and labeled as such.
 */
@Component({
  selector: 'moxy-community',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <h1 i18n>The community, counted anonymously</h1>
    <p i18n class="sub" style="max-width:640px">
      Opted-in profiles contribute coarse monthly counts — never identities, phrases, or exact
      answers. Buckets with fewer than ten contributors stay hidden, and desire counts carry
      deliberate random noise, so what you see here are honest estimates about a crowd, never facts
      about a person.
    </p>

    @if (view.value(); as v) {
      @if (bands().length === 0) {
        <div class="card">
          <p i18n class="sub">
            Nothing to show yet — the counters need at least ten contributors in a bucket before it
            appears. Opt in from
            <a routerLink="/me">your profile</a> and check back as the menagerie grows.
          </p>
        </div>
      } @else {
        <div class="card">
          <h2 i18n>Age bands ({{ v.epoch }})</h2>
          @for (band of bands(); track band.label) {
            <div class="bar-row">
              <span class="bar-label">{{ band.label }}</span>
              <div
                class="bar-track"
                role="img"
                [attr.aria-label]="band.label + ': ' + band.n + ' creatures'"
              >
                <div class="bar-fill" [style.width.%]="band.widthPct"></div>
              </div>
              <span class="bar-value">{{ band.n }}</span>
            </div>
          }
        </div>

        @if (myBandLabel(); as bandLabel) {
          @if (seekingRows().length || desireRows().length) {
            <div class="card">
              <h2 i18n>Creatures aged {{ bandLabel }}</h2>
              @if (seekingRows().length) {
                <h3 i18n>Open to…</h3>
                @for (row of seekingRows(); track row.label) {
                  <div class="bar-row">
                    <span class="bar-label">{{ row.label }}</span>
                    <div class="bar-track">
                      <div class="bar-fill" [style.width.%]="row.pct"></div>
                    </div>
                    <span class="bar-value">{{ row.pct }}%</span>
                  </div>
                }
              }
              @if (desireRows().length) {
                <h3 i18n>Desires <span class="fine">noisy estimates, by design</span></h3>
                @for (row of desireRows(); track row.label) {
                  <div class="bar-row">
                    <span class="bar-label">{{ row.label }}</span>
                    <div class="bar-track">
                      <div class="bar-fill" [style.width.%]="row.pct"></div>
                    </div>
                    <span class="bar-value">~{{ row.pct }}%</span>
                  </div>
                }
              }
            </div>
          }
        } @else {
          <div class="card">
            <p i18n class="sub">
              Answer your age band on <a routerLink="/me">your profile</a> to see how creatures in
              your band answered — computed right here in your tab.
            </p>
          </div>
        }
      }
    } @else if (view.error()) {
      <div class="card">
        <p class="sub">{{ errorMessage() }}</p>
      </div>
    } @else {
      <div class="card"><p i18n class="sub">Counting the menagerie…</p></div>
    }
  `,
  styles: `
    .bar-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 6px 0;
    }
    .bar-label {
      width: 220px;
      flex: none;
      text-align: right;
      font-size: 13px;
      color: var(--ink-2);
    }
    .bar-track {
      flex: 1;
      height: 12px;
      border-radius: 6px;
      background: var(--border);
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 6px;
      background: var(--accent);
    }
    .bar-value {
      width: 48px;
      flex: none;
      font-size: 12.5px;
      color: var(--muted);
    }
    h3 {
      margin: 14px 0 6px;
    }
  `,
})
export class CommunityComponent {
  private readonly config = inject(ServerConfigStore);
  private readonly draft = inject(DraftStore);
  private readonly session = inject(ProfileSessionStore);

  constructor() {
    void this.session.restore();
  }

  protected readonly view = resource({
    params: () => ({ state: this.config.state() }),
    loader: async ({ params }): Promise<MetricsRecord> => {
      if (params.state === 'loading') return new Promise<never>(() => undefined);
      const client = this.config.client();
      if (!client) throw new Error('No profile server is configured.');
      const epoch = currentEpoch(Date.now());
      return (await client.getMetrics(epoch)) ?? { epoch, buckets: {} };
    },
  });

  private readonly ageItem = getItem('ab.age')?.item;

  protected readonly bands = computed(() => {
    const buckets = this.view.value()?.buckets ?? {};
    const rows = (this.ageItem ? optionLabels(this.ageItem) : [])
      .map((label, i) => ({ label, n: buckets[`age|${i}`] ?? 0 }))
      .filter((b) => b.n > 0);
    const max = Math.max(1, ...rows.map((b) => b.n));
    return rows.map((b) => ({ ...b, widthPct: Math.round((100 * b.n) / max) }));
  });

  private readonly myBand = computed(() => {
    if (!this.session.active()) return null;
    const age = this.draft.answers()['ab.age'];
    return typeof age === 'number' ? age : null;
  });

  protected readonly myBandLabel = computed(() => {
    const band = this.myBand();
    if (band === null || !this.ageItem) return null;
    return optionLabels(this.ageItem)[band] ?? null;
  });

  protected readonly seekingRows = computed<RateRow[]>(() => {
    const band = this.myBand();
    const buckets = this.view.value()?.buckets ?? {};
    if (band === null) return [];
    const seeking = getSection('seeking');
    if (!seeking) return [];
    return seeking.items.flatMap((item) => {
      const n = buckets[`${band}|${item.id}|_n`];
      const positive = buckets[`${band}|${item.id}|1`];
      if (!n || !positive) return [];
      const label = itemLabel(item);
      return [{ label, pct: Math.round((100 * positive) / n), n }];
    });
  });

  protected readonly desireRows = computed<RateRow[]>(() => {
    const band = this.myBand();
    const buckets = this.view.value()?.buckets ?? {};
    if (band === null) return [];
    const desires = getSection('desires');
    if (!desires) return [];
    return desires.items.flatMap((item) => {
      const n = buckets[`${band}|${item.id}|_n`];
      const positive = buckets[`${band}|${item.id}|1`];
      if (!n || !positive) return [];
      const rate = debiasDesireRate(positive, n);
      if (rate === null) return [];
      const label = itemLabel(item);
      return [{ label, pct: Math.round(rate * 100), n }];
    });
  });

  protected errorMessage(): string {
    return errorText(this.view.error());
  }
}
