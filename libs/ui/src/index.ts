// @moxy/ui public API — the design-system components and browser utilities.

export { MAX_COMPARE, seriesVar } from './charts/series';
export { PersonKeyComponent } from './charts/person-key.component';
export { ScaleStripComponent } from './charts/scale-strip.component';
export { InterestMatrixComponent } from './charts/interest-matrix.component';
export { MeterComponent } from './charts/meter.component';
export { StatTileComponent } from './charts/stat-tile.component';
export { SimDotComponent } from './charts/sim-dot.component';
export { AnswerTextComponent } from './charts/answer-text.component';
export { PairMatrixComponent } from './charts/pair-matrix.component';
export { RingComponent } from './charts/ring.component';
export { RadarComponent, type RadarSeries } from './charts/radar.component';
export { FlowComponent } from './charts/flow.component';
export { DumbbellComponent } from './charts/dumbbell.component';
export { AgreementStripComponent, type AgreementRow } from './charts/agreement-strip.component';

export { ToastService, type ToastKind } from './widgets/toast.service';
export { ToastComponent } from './widgets/toast.component';
export { QrCodeComponent } from './widgets/qr-code.component';
export { PersonaChipComponent } from './widgets/persona-chip.component';
export { CreatureIconComponent } from './widgets/creature-icon.component';
export { LocationBannerComponent } from './widgets/location-banner.component';
export { habitatClass, habitatMotif, type HabitatMotif } from './widgets/persona-decor';
export { CREATURE_SPRITES, type PixelSprite } from './creatures/pixel-grids';
export { creaturePixelSvg, creatureSpriteRects, spriteSvg } from './creatures/pixel-art';

export { copyText } from './util/clipboard';
export { downloadText } from './util/download';
