// URL matchers for the LEGACY data-link formats — part of the compatibility
// contract. Under hash-location strategy, an old link like
//   https://host/#p=m1.abc          → router path segment "p=m1.abc"
//   https://host/#c=m1.a~m1.b       → router path segment "c=m1.a~m1.b"
// These matchers claim those segments and expose the code(s) as params.
// They MUST stay first in the route array.
import { UrlSegment, type UrlMatchResult } from '@angular/router';

export function profileLinkMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 1 && segments[0].path.startsWith('p=')) {
    return {
      consumed: segments,
      posParams: { code: new UrlSegment(segments[0].path.slice(2), {}) },
    };
  }
  return null;
}

export function compareLinkMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 1 && segments[0].path.startsWith('c=')) {
    return {
      consumed: segments,
      posParams: { codes: new UrlSegment(segments[0].path.slice(2), {}) },
    };
  }
  return null;
}
