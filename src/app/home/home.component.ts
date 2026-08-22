import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'moxy-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="hero">
      <span class="brand-mark" aria-hidden="true">M</span>
      <h1>Know where you overlap — without giving up who you are.</h1>
      <p class="lede">
        Moxy is a compatibility survey for every kind of connection — friendship, partnership,
        polyamory, marriage, play partners, chosen family. Your answers become a link you can
        share; lay two or more profiles side by side and see the overlap, the gaps, and the
        possibilities. No accounts. No servers. Nothing to trace back to you.
      </p>
    </section>

    <div class="home-cards">
      <div class="card home-card">
        <h2>📝 Make your profile</h2>
        <p class="sub">
          A thoughtful survey about who you are, what you value, and what kinds of connection
          you’re open to. Every question is optional.
        </p>
        <a class="btn btn-primary" routerLink="/survey">Start the survey</a>
      </div>
      <div class="card home-card">
        <h2>🔍 Compare profiles</h2>
        <p class="sub">
          Paste profile links side by side. See value alignment, mutual interests, lifestyle
          fits and gaps — and private desires only where they’re mutual.
        </p>
        <a class="btn" routerLink="/compare">Open the compare view</a>
      </div>
      <div class="card home-card">
        <h2>🔑 Your vault</h2>
        <p class="sub">
          Save profiles and connections behind a passphrase — generated for you, stored by no
          one. Keep it and you can come back; lose it and it’s gone. That’s the deal.
        </p>
        <a class="btn" routerLink="/vault">Open the vault</a>
      </div>
    </div>

    <div class="card">
      <div class="privacy-strip">
        <div>
          <h3>🔗 The link is the database</h3>
          <p class="sub">
            Your profile is compressed into the link itself (the part after #, which browsers
            never send to any server). Delete the link, and the profile no longer exists.
          </p>
        </div>
        <div>
          <h3>🎭 Mutual-only reveals</h3>
          <p class="sub">
            The optional desires section is shared only as scrambled fingerprints. A desire is
            revealed only when both profiles marked it — and "not for me" answers are never
            shared in any form.
          </p>
        </div>
        <div>
          <h3>🕳️ Nothing identifies you</h3>
          <p class="sub">
            No email, no phone number, no login. A random passphrase is your only key, and it
            never leaves your device.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class HomeComponent {}
