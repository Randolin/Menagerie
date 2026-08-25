import { describe, expect, test } from 'vitest';
import {
  SEAL_PAD_BYTES,
  boopPublicKey,
  generateBoopKeyPair,
  mintBoopBoxKey,
  openSealed,
  openWithKey,
  sealTo,
  sealWithEphemeral,
  sealWithKey,
} from './sealed-box';
import { b64urlToBytes } from '../codec/base64url';

// Frozen vectors: a fixed recipient keypair, a fixed ephemeral keypair, and
// a fixed IV must forever produce this exact ciphertext, and the ciphertext
// must forever open to this exact object. A format change breaks in-flight
// knocks for real people — regenerating these vectors is a breaking change.
const VEC = {
  recipientPub:
    'BPr2WdIxuvnEwdIzJUv0unMmJXYd_y_heD8XnsId20eSuHIjgkCiniER81Nalx9jajL-ZQOaI2j5eb2AQrTGSj4',
  recipientPriv:
    'eyJrZXlfb3BzIjpbImRlcml2ZUJpdHMiXSwiZXh0Ijp0cnVlLCJrdHkiOiJFQyIsIngiOiItdlpaMGpHNi1jVEIwak1sU19TNmN5WWxkaDNfTC1GNFB4ZWV3aDNiUjVJIiwieSI6InVISWpna0NpbmlFUjgxTmFseDlqYWpMLVpRT2FJMmo1ZWIyQVFyVEdTajQiLCJjcnYiOiJQLTI1NiIsImQiOiJDWHdnVjRPdEVuTlVsU2RuZGhpX1NGbklDVlFHSTkzYjdEZG5TS3ZGSnJzIn0',
  ephPrivJwkB64:
    'eyJrZXlfb3BzIjpbImRlcml2ZUJpdHMiXSwiZXh0Ijp0cnVlLCJrdHkiOiJFQyIsIngiOiJGMWJEZEFRaU5qbk4xLXFlMThvM2Y4eEFHb3BkUGJXdVJWc1AycHUxcWpFIiwieSI6IlZDQlJHay1pYVF2R203dWxmcFFfbXVkNkFDLTFVS0xzcjZFd0NEenZocVUiLCJjcnYiOiJQLTI1NiIsImQiOiJ4TXEtd0J1X0JiQVE4OC1OOTUxc1IzM0pHcGxuZGVUdmtqUE9Ua09IMnAwIn0',
  ephPubRaw:
    'BBdWw3QEIjY5zdfqntfKN3_MQBqKXT21rkVbD9qbtaoxVCBRGk-iaQvGm7ulfpQ_mud6AC-1UKLsr6EwCDzvhqU',
  sealed:
    'BBdWw3QEIjY5zdfqntfKN3_MQBqKXT21rkVbD9qbtaoxVCBRGk-iaQvGm7ulfpQ_mud6AC-1UKLsr6EwCDzvhqUBAgMEBQYHCAkKCwzw6aLiPrP6-4Q6jDZy-NtjYzWSGV96qiTqoJNpjRYaa4y8yw4RnIJwIshZ_78nCtahP66Mj6aQq8-A1xKugQLUMkB4dLDVDpYj_g64iku_4nZRsCHqRAV4rdEKH-Q0VbBQkGoMEBW-QpmxHFe9xoibouJwTfZs0-8ELVDKBfbSquAUQvEj03jcVhcBEodzu1FEz_hMbmXVTc_FiGW0Iowm1Zr5zfy4gbjXO5JjwrqBx9vKK5poIIz6WbjpjZxObjkxBVQFLjIrNyFlRQy-WTr3-EaBJDU42Cu6qZpDZilWtS2r7LjhopfSKovLSU6fZ6T0i2rVjltIEUokP6fsCuojaM_aZo5gIg_J7BrNdUg4OiQsBlArITeJIV6pPXV5pOm5GBH-LX_GBiqboACHQnqrPuU-3rFl69DZvsZcip9VzJ7YOuk1t-M1QNaOZkAu7xlkW32D4kfHxkDoEm9_uGxOogtMsSggC2XFO1saBEr7-Y78fKBxYez0SQBnHV1GvxbLfZvPypLvgc3NVgqdtM_1AxsCqpyV4U3c6vGAEm0xI62UnQI7GC0fFuCbxDJSH4GFDRvo3Vu5aOBba3xHyab7z0l45WjE6szvX3VEvPeeVyzPmoIwUr0dgwcCGtrmfKP0JdjS6bIFN8sT-vtfkoTh_auJhyDGvjiLcsM70r5cIJ1ArlswgUgP2Iof_abu9GtRCwjKxGDGkNQw9nMTpEXVuUY_iFRTv6dd4NUcKcUTjSJzit8bHXDf7TZiHZ-6QG2bnePHP0At0W6L0uYdNrGGJTwC496D0Q4MEignuDVRG4QWBh24c7fqus-aaG-ZNOAmalx28kofL9b-zpFRknJXFP_zfMoXIYIP-EKwd_V2s72SPVgTa3-7QLuf6Xn7UAVs3_IQ5XyPkcTh63jZrG44xuxMfhKnyxeYTlAD-7snemXc78ZveGdmxYXDHc3l3OX_kEaRTMBE1M0oC2U_ZyxPfQo96tJucYYbeoTPYmYyXGWG3k0xsMO-pAiphfQmb--_sSZd9Uug4kMsodvde26xqj4fwV_BWkoTkLS52c0UPUsveucMG1Rqn4ZegKwtlta1Yqkwt2X-bBYfsrP3tKlQyTd7o94gUXVT2zVUv_h_qWzhsGh5DuHy0GLzWSd4oXEEAqGDAcDuvjmUPcB56ebbmPjQx6w9Nsr13hwY6XF4WhtD1Ah5wDrrWtt7kqK-O1JnAS_b8DTCpFuYwoCMVKs3DaJAeHQ8KCf-zHdfGwNzw65ppdthKl59a2ynoiKyPT-Qq1Uaso5_5a2G4e0S8tetaOaWl6cbbWn6d3jqHGam4nipaLkDKv-6CSmoKDcTG9GaTEKxNWVBfqsqgOcAn92TwMECrPwaH4gF0Y7h4vkpLYFBkM_E_jIxnLFov3D9KCTXM0jSrLbm9g4qST69HK-IwaYjX6xZimn709wWUoE-GIQBcNYic51CsnTtSrxFeFe6mJJKfOp_weY2N0X3ZzrZZaXVJqoZVpBC51M60ftiPq7DDzERclE9KU5vXlCXXQ85P9umquPcdhTJOLdC4n7gEN1fT1lRW2zt2li7-DUIpc9Si8WGOMuYzYeGhTdXIl2nSg8xaNeYp1ox2sxmshEBTKm1_8Z90dLg7Trwqb7ZTugwAJuK8qduX4z0zaeVWvC5IYHA9hOFE9LfsxoPtXXRYXFeffV1ldTxzAcwLmchY2SAwW_xd_I6eMkrPM57-8kNJ1God5mgPVNxqhKfle5txKPaDDvcuTPAdIrHvDzqQfUSxJuDaBA1y7pA3ZKzry5A2Zv1vghG7_Ga-5sJdgZ27qyk6RAAD4ZHU4eYMgXb6NEIR3HHU0nfZuA-6lb2IjxmKYNB5oAztVrwyJEP5cQ1Ke5POyKX2IJ9XPH1Z4UUGMucCsHnehFumjsBuBscRBWMfSeD9j-gwNgk_d0s5d3FYaT1AOF99GPuJWc6IYpRxZZPTynJYdYYCz7xlF27Eq6rBg2zBYlBxbSmz0fjNzZOx5J13aP2fWTHN1SG0g4YDHlP4A9xZUxxK_GkbgzAMjh1EY36-oPj23NpdTZe96v4Id5K0x-e50itILmqDY1ypx1NS4r4zhHbSwQTvwiBVHN3slQ8hXvl77Aej6rCpw7I8Y4x6mRDDzUEt_S1sM6TM6IwmtUkSnBSJle9w_uWlZF3URUxLRY_zjR9Th-CKJ5hEnI-FCDwfc4gfIy2eH-s49a1GiLoiP2YW3fqq18_Ic1llIwFv4c2SqDDnirKb77BxA8Rja79k4nd8FSGHjy-ku6KYpov_PcpXoLujevwMXjP3IvkAe0CzlOZWEQEdo0rfeL24vWjnLgYkFFtRPlF6q2FxwWGmaIFkMfnihCYhOBHV6lPx9rm30IBhR7lwXPNw5UO-Dnq1oCn21GR6-6fKGZmhPPSSdAR8-uuaIPkB_7hfsgJ1tKZObCad8mxX-XDWLbaabGmCvIC2noMlx9A6TBRl4bSn99WjLYzFqIxPnkP-G_S5vXDb4O84_TsnIDBdcRU4D6wMOMtezZlail6cY9eLTuXzf470_ZiLSdo7M_ae0THWK9oafOUlNp-gcfVtfUHy0V42L1fc9zOH_tdNLboUA3hmbgHiybaydRppuK9ybfrUKwBRsS57-mzgm8LsiluGjlw6k84jnXDz5WLZroSVgLYVrzXHpMTiYBaE80lCGT-2Id7Wein5XxOK0_UTWotJj7TMpnbkmO2ny3LuchUJytKv_RDss2i_n1yewQ',
};

const PLAINTEXT = {
  v: 1,
  kind: 'boop',
  from: { label: 'amber-fox', emoji: '\u{1F98A}' },
  intents: [0, 2],
};

describe('sealed box', () => {
  test('frozen vector: the fixed ciphertext opens to the fixed object', async () => {
    await expect(openSealed(VEC.recipientPriv, VEC.sealed)).resolves.toEqual(PLAINTEXT);
  });

  test('frozen vector: fixed ephemeral + IV re-produce the exact ciphertext', async () => {
    const jwk = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(VEC.ephPrivJwkB64)),
    ) as JsonWebKey;
    const ephPriv = await globalThis.crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
    const iv = new Uint8Array(12);
    for (let i = 0; i < 12; i++) iv[i] = i + 1;
    const sealed = await sealWithEphemeral(
      ephPriv,
      b64urlToBytes(VEC.ephPubRaw),
      iv,
      VEC.recipientPub,
      PLAINTEXT,
    );
    expect(sealed).toBe(VEC.sealed);
  });

  test('random roundtrip', async () => {
    const pair = await generateBoopKeyPair();
    const obj = { v: 1, kind: 'reply', from: { label: 'dusk-otter', emoji: '🦦' }, intents: [1] };
    const sealed = await sealTo(pair.pub, obj);
    await expect(openSealed(pair.priv, sealed)).resolves.toEqual(obj);
  });

  test('padding: ciphertext length never varies with content', async () => {
    const pair = await generateBoopKeyPair();
    const tiny = await sealTo(pair.pub, { v: 1 });
    const big = await sealTo(pair.pub, {
      v: 1,
      attachments: { viewPhrase: 'amber azure fox mistwoven emberlit fernhollow'.repeat(4) },
    });
    expect(tiny.length).toBe(big.length);
    expect(b64urlToBytes(tiny).length).toBe(65 + 12 + SEAL_PAD_BYTES + 16);
  });

  test('content larger than the bucket refuses to seal', async () => {
    const pair = await generateBoopKeyPair();
    await expect(sealTo(pair.pub, { x: 'a'.repeat(SEAL_PAD_BYTES) })).rejects.toThrow(/too large/i);
  });

  test('tampered ciphertext refuses to open', async () => {
    const flipped =
      VEC.sealed.slice(0, 200) + (VEC.sealed[200] === 'A' ? 'B' : 'A') + VEC.sealed.slice(201);
    await expect(openSealed(VEC.recipientPriv, flipped)).rejects.toThrow();
  });

  test('a different recipient key cannot open it', async () => {
    const other = await generateBoopKeyPair();
    await expect(openSealed(other.priv, VEC.sealed)).rejects.toThrow();
  });

  test('the public key rebuilds from the stored private half', async () => {
    const pair = await generateBoopKeyPair();
    expect(boopPublicKey(pair.priv)).toBe(pair.pub);
  });

  test('reply-box seal: roundtrip, fixed size, wrong key refused', async () => {
    const keyB64 = mintBoopBoxKey();
    const tiny = await sealWithKey(keyB64, { v: 1 });
    const big = await sealWithKey(keyB64, { v: 1, pad: 'x'.repeat(900) });
    expect(tiny.length).toBe(big.length);
    expect(b64urlToBytes(tiny).length).toBe(12 + SEAL_PAD_BYTES + 16);
    await expect(openWithKey(keyB64, tiny)).resolves.toEqual({ v: 1 });
    await expect(openWithKey(mintBoopBoxKey(), tiny)).rejects.toThrow();
  });
});
