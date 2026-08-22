import { Injectable } from '@angular/core';
import {
  buildMatchTokens,
  buildSharePayload,
  encodePayload,
  randomSalt,
  shareUrlFor,
  type Answers,
} from '@moxy/core';

export interface ShareLink {
  readonly code: string;
  readonly url: string;
  readonly openCount: number;
  readonly desireCount: number;
}

/**
 * Turns an answer set into a share link — ALWAYS with a fresh salt, so two
 * separately shared links can't be correlated by their desire fingerprints.
 * Emits the legacy `#p=` format so links open on any Moxy deployment.
 */
@Injectable({ providedIn: 'root' })
export class ShareLinkService {
  async encode(answers: Answers): Promise<ShareLink> {
    const salt = randomSalt();
    const tokens = await buildMatchTokens(answers, salt);
    const payload = buildSharePayload(answers, tokens, salt);
    const code = await encodePayload(payload);
    return {
      code,
      url: shareUrlFor(code),
      openCount: Object.keys(payload.a).length,
      desireCount: Object.entries(answers).filter(
        ([k, v]) => k.startsWith('dp.') && typeof v === 'number' && v >= 1,
      ).length,
    };
  }
}
