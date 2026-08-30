import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ANIMALS, ANIMAL_HABITATS, HABITAT_META } from '@mng/core';
import { CreatureIconComponent } from '@mng/ui';

/**
 * The full pixel menagerie — every animal a creature name can end with.
 * Everything here is public by design (the wordlists ship in the app), so
 * this page reveals nothing; it exists because 64 tiny creatures deserve a
 * page, and it doubles as the review surface for iterating the art.
 */
@Component({
  selector: 'app-creatures',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CreatureIconComponent],
  template: `
    <div class="card">
      <h1 i18n>Meet the menagerie</h1>
      <p i18n class="lede">
        Every profile hatches as one of these 64 creatures — the animal is the third word of its
        view phrase. Same phrase, same creature, for everyone who looks.
      </p>
      <div class="creature-grid">
        @for (animal of animals; track animal.name) {
          <div class="creature-cell">
            <mng-creature-icon [emoji]="animal.emoji ?? '🐾'" [animal]="animal.name" [size]="64" />
            <span class="fine">{{ animal.name }}</span>
            <span class="fine creature-habitat">{{ habitatMotif($index) }}</span>
          </div>
        }
      </div>
      <p i18n class="fine">
        Art is first-party pixel work and always improving — the creature on your dashboard may get
        a glow-up someday, but it will never change species.
      </p>
    </div>
  `,
  styles: `
    .creature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
      gap: 12px;
      margin: 16px 0;
    }
    .creature-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 10px 4px;
      border: 1px solid var(--hairline);
      border-radius: var(--radius-sm);
      background: var(--surface-2);
    }
    .creature-habitat {
      opacity: 0.8;
    }
  `,
})
export class CreaturesComponent {
  protected readonly animals = ANIMALS;

  protected habitatMotif(index: number): string {
    return HABITAT_META[ANIMAL_HABITATS[index]].motif;
  }
}
