import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GC_EMPTY_HUMAN, GC_IDLE_HUMAN } from '@moxy/core';

@Component({
  selector: 'moxy-about',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="hero">
      <h1>How Menagerie works — and exactly what it does and doesn’t protect</h1>
      <p class="lede">
        Menagerie is a static page plus one small open-source server that stores only
        ciphertext it can never read. No accounts, no email, no names, no analytics,
        no cookies — and no free-text fields at all: every answer is a pick from fixed
        options, so nothing you can type into a profile can identify you. Everything
        below is verifiable in the source.
      </p>
    </div>

    <div class="card">
      <h2>🥚 Hatching: two phrases are the whole identity</h2>
      <p>
        Hatching mints two random phrases. The <strong>view phrase</strong> (six words —
        your creature’s name plus three more) is what you share: as text, a link, or a QR
        code. The <strong>edit phrase</strong> (five words, ~65 bits of entropy) is yours
        alone and is the only way to change or delete the profile. Each phrase is run
        through Argon2id — a memory-hard key derivation that forces every guess to chew
        through 64&nbsp;MiB of RAM — to derive an address on the server and an AES-256-GCM
        encryption key. The server sees only the addresses and ciphertext, never a phrase,
        never a key, never an answer.
      </p>
      <ul>
        <li>Keep the edit phrase → you can log in from any device and edit or delete.</li>
        <li>Lose it → the profile can never be edited again. Nobody can help; that’s the point.</li>
        <li>
          The phrases are unrelated: a view phrase can never edit, and the server checks
          writes with a token it stores only as a hash.
        </li>
      </ul>
    </div>

    <div class="card">
      <h2>🦊 Your creature is your view phrase</h2>
      <p>
        The first three words of your view phrase — like “brave-amber-otter” — are your
        creature: shown as your profile’s identity and drawn into your QR code’s colors.
        That’s deliberate: everyone you share with sees the same recognizable creature.
      </p>
      <p class="sub">
        The flip side, honestly: those three words are public-by-design, so the secret
        part of a view phrase is really the poetic tail — the last three words, drawn
        from curated lists of 2,048 each (33 bits). Argon2id’s memory cost prices a
        targeted brute-force of that tail in GPU-months to a GPU-year — a real curtain,
        not a vault door. The creature’s accent color is computed from the public three
        words alone, so nothing shown on screen hints at the tail. Your edit control
        never rests on any of this. “New creature” re-mints the whole view phrase: every
        old link, QR code, and desire fingerprint dies instantly, and that is the
        unlink lever.
      </p>
    </div>

    <div class="card">
      <h2>⚖️ Importance marks travel with your answers</h2>
      <p>
        You can mark any answered question <em>matters</em>, <em>matters a lot</em>, or
        <em>dealbreaker</em> (with the answers you could live with). These marks are part
        of your profile: anyone you share your view phrase with sees them alongside your
        answers, and comparisons weigh each side's score by what that person said matters
        — so “fit for you” and “fit for them” are honestly different numbers.
      </p>
    </div>

    <div class="card">
      <h2>📊 Anonymous counters: the one thing the server can read — because you chose it</h2>
      <p>
        Off by default. Opting in submits, once a month, a list of coarse counts:
        your age band, and bucketed answers joint-counted against it (open to
        friendship: yes; alcohol: never; …). No name, no creature, no phrases — the
        submission carries only a token derived so the server cannot link it to your
        profile, used once per month to prevent double-counting.
      </p>
      <ul>
        <li>Desire counts are submitted through <strong>randomized response</strong>:
          each bit is flipped with 25% probability before it leaves your device, so
          even the server can never know whether any single answer was real — only
          the crowd's rate can be estimated.</li>
        <li>Buckets with fewer than ten contributors are never served.</li>
        <li>Each month replaces the last; nothing accumulates per person, and
          opting out simply stops future submissions.</li>
        <li>The result is the <a routerLink="/community">community page</a> — and yes,
          these counters are the one deliberately readable thing in the database.
          That is the entire, opt-in trade.</li>
      </ul>
    </div>

    <div class="card">
      <h2>🕸️ Groups: shared rosters, honestly explained</h2>
      <p>
        A group is one more encrypted record: a roster the server can’t read, addressed
        and unlocked by a shared <strong>group phrase</strong> (the group gets its own
        creature and invite QR). Joining deposits a snapshot of your <em>open</em> answers
        — desires never travel into a group in any form. Deposit pseudonymously and the
        roster shows a random two-word alias; deposit openly and it shows your creature
        and view link. The creator holds a separate admin phrase for kicks, re-mints,
        and deletion.
      </p>
      <div class="notice-warn notice">
        <strong>The honest ledger: </strong>
        everyone who ever holds the group phrase can read the roster — kicking removes a
        deposit but not that access; only re-minting does, and it asks everyone to rejoin.
        Deposits are snapshots, not live profiles — refresh yours after big changes. And
        the server, while unable to read anything, does see how many deposits each group
        holds and could notice which profiles are active around the same moments a group
        is — a traffic pattern, not content.
      </div>
    </div>

    <div class="card">
      <h2>🎭 The desires section: mutual reveal, honestly explained</h2>
      <p>
        Desires never travel as readable answers. Each positive answer (anything warmer
        than “Not for me”) becomes a salted fingerprint in your profile’s viewable half.
        Comparing checks whether both profiles carry a fingerprint for the same desire and
        only then reveals it. One-sided interests stay invisible, and the fingerprints are
        padded and shuffled so even their count is hidden.
      </p>
      <div class="notice-warn notice">
        <strong>The honest limit: </strong>
        a technically skilled person who can view your profile could test every possible
        desire against the fingerprints and recover your positive answers. “Not for me”
        answers are never encoded in any form, so they are genuinely unknowable. Mark a
        desire only if you’d be comfortable with an enthusiastic match knowing it.
      </div>
    </div>

    <div class="card">
      <h2>🖥️ What the server can and cannot see</h2>
      <p>
        The server holds, per profile: two opaque 128-bit addresses (unguessable, and
        one-way — they can’t be reversed into phrases), two encrypted blobs, a write-token
        hash, and hour-coarse timestamps. It cannot decrypt anything, cannot forge an
        update, and never asks who you are. IP addresses are used only for in-memory rate
        limiting and are never written down.
      </p>
      <p class="sub">
        What a server operator <em>could</em> observe or do — the honest ledger: see when
        a profile is viewed or edited and how big it is (activity patterns, not content);
        tell that a view identity and an edit identity belong to the same profile; count
        profiles; and withhold, delete, or serve stale ciphertext — a nuisance that denies
        availability, never reads data, and is detected the moment decryption fails.
        Compared to the old links-carry-everything design, a server now exists and sees
        traffic at all: that’s the trade that makes typeable phrases and tiny QR codes
        possible. You can self-host it — one dependency-free file in the repository.
      </p>
    </div>

    <div class="card">
      <h2>🧹 Housekeeping, stated plainly</h2>
      <p>
        Profiles that never save an answer are deleted after {{ gcEmpty }}. Profiles
        untouched — no edit and no view — for {{ gcIdle }} are deleted too. Any save or
        view resets the clock. Deletion is real deletion: the row is gone.
      </p>
    </div>

    <div class="card">
      <h2>🧭 Who Menagerie is for</h2>
      <p>
        Everyone whose connections don’t fit one template: monogamous couples checking
        alignment before moving in; polycules mapping a constellation; swingers and play
        partners negotiating interests without awkward guessing; asexual and aromantic folks
        looking for queerplatonic partnership; friends who want to know if they’d survive a
        road trip. The survey treats every one of those as a first-class outcome, not a niche.
      </p>
    </div>

    <div class="card">
      <h2>🛠️ Verify or self-host it</h2>
      <p>
        Menagerie is open source under the
        <a href="https://github.com/Randolin/Menagerie/blob/main/LICENSE" rel="noreferrer">AGPL-3.0</a>
        — anyone may use, study, and self-host it, and anyone who runs a modified version
        as a service must share their modifications under the same license. The full
        source lives at
        <a href="https://github.com/Randolin/Menagerie" rel="noreferrer">github.com/Randolin/Menagerie</a>.
        The app is a static bundle (GitHub Pages works); the server is a single Node file
        with zero dependencies. Point any copy of the app at any server via its config
        file — your phrases work wherever that same server is reachable.
      </p>
      <p class="sub">
        Threat-model fine print: Menagerie can’t protect you from what you choose to share,
        from someone photographing your screen, or from a compromised device or browser
        extension. It simply refuses to create the identity databases such attacks
        usually target.
      </p>
    </div>
  `,
})
export class AboutComponent {
  protected readonly gcEmpty = GC_EMPTY_HUMAN;
  protected readonly gcIdle = GC_IDLE_HUMAN;
}
