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
    'BBdWw3QEIjY5zdfqntfKN3_MQBqKXT21rkVbD9qbtaoxVCBRGk-iaQvGm7ulfpQ_mud6AC-1UKLsr6EwCDzvhqUBAgMEBQYHCAkKCwwQ7ygaTkQxbMjsKEb5d2zC2ylmHoneVJj86Br6gukiuoIGeHmgh4OHbYs3Hf-wNN_uYrR01lA_XKFNZqmZVBHaD-b51oAwzigiz9LLHn7aKritl4h2JzT3MPntcnif85_NdOqsgD_o6K5n841LpUeOayKNWYdbtLFysg8RF-iuVv9-HmBxsWO3BUoO6ZE0dylGYo_yo5eaY3jEYNU27Xg_aRNBPY0KRjtLhksxRrodHpnx1O8Rrg2Oa7nizeLl3KkVgXU_t7VQyk-xAilliVOB8-R43pJ0eaWKVjCU_CeBwoCVl6mGD0r2NsxomBfFYR1puItHXVX4J75Ae9a6aqf7kH0m-wjbKtyxu1pYzrtk69vtyiyuNT3fpVZfv_ZDx8KfUwzxAXxP4yVc91UxK7KCi_r6h-izr6uSZieB_ZXDLS3KQUNOwweDz7a0sek23pP8rMugFc3aLylEdyhQaPjRVSl3zOuNPLnf66auXtuSw-iJmlyDnNLe5YXMesayioY9wayNZnwKwMkAQpECB_8-qfelI-eunfGNOBnu34xrmTluJv6lvy1Ipd68GV7cOC7op0YjOw8LUDYExFzGdi7y5z-tuUQwiFFwMR4vKw1L420LHnrpn33xiAYkVyvGqJ6aaRV70-eQ4YY2p-Z20QmxSy0zoAj_LkuP0Qc7vxkoHGpAPgUJN_F9afMLk2BkxHmcvKxY7pt4XgUApdA51OvikPJA6TUiPULTWX00rb7L2bi7oHyxyaFL626HiY_cGhphK19QD2YHU_d2zD4K0rfsibshV5JvDjFG5tEO5FQnQvXUgA9GuHqSlBOt0mYb9a2slW_JhF27z-2ic6HhE2gaxu9WHl0fFHqo8lO5rb7cLa5pZaXBIQd4iRZLyaXpVp4vrvii6Yv0igLIDVTZFZ6RlqvkC1KdmDalt1yuT_sOTB1CBQPldnu14xuQLBXoXXfRjqZDEfFhdHdniP-KJEx9L7Ei5An-F55sEutryjPrNOk8FLcVIY5tfEaFii2oVp6lMXeE6wCzdBXi7luT7wM7HMwmwQcCha5oPEFr4Osbm6-mEIsPqXh-TKvIgvc0LhVXf4pl2PX80DtSckMrsPkRBRsbgNvMlaIaJ7GcqdY0R2kltbD6vWq2GhVBrtLcxr_7UJxo4ygPafs6XHXoNMUqcxc0HqLhBPhdHBg5CNBCnDereoaxn_IW1k6pWZXB3mr0MM9zL-U8EcFq8S-5eq8h59MU7NdYx5ROO6_2OCBdJaNU-Rhr5vuTA7GBGrxCSG9gkRAFhqDlB748pOe29mt_IZRJ-vHFaKA4loRyndySk5CpSsjFDl7JmOHY72dJhhaJfbHtsmWlJqq2Gp15Fmq-bDs5N6QHFfbCO_ftnikWrKG9uo9bLe7sL7z4pn_cRt4qGlkfugSvYRnsloVzdGqqQdeJNLuRd8WBjpPw9qnBJk_mbHXYc5Xkb6DrFakH7WC0XMFN1yF5uCZVa6LGTS2tUjvKtlWfbDPcvqlBqZY5Cmz3tcUEvyOpsX-LaxANgaf0q10Ujq0Ce_Ark55eWXE4CMZ5sQqyvF_qwFFZk6YCCrywdSuAzi6vo_1F20GEBtI4Ubv6G66K8XaWZ6Me7UmNJx4ph5aWFKpR7pzcMJP_pDgrySkNwGNnzxA2aIiZ4bKPXxyTtJWxlF2iZPggt-0A_oxxEO9mPtDFb2Kof2P7rBcCG2OaQVDnVajszHyyd4XLpewnCm68ocXOxvUWx8NY7Xc5GeUwN82SBYDteL3jMIH9Ja6t4NhhX-JawLoAom12FRwsWAwwO0RdY_btDiFfGuqmY2JBPUL6Uijv5V-EIiGxLaEtU6EtxK2o-OgXyJxHVBt8ShoZXP95thpNPLPfKHheQJnIrl0KS4orDVw19hu3YjuDiDbBcflGrKOFXwJ2Qag1X_IPLLLzQ83c0eHPTcD5s96dzBQaZrlXLUa6VUwSJ8DEzOIt3M-34rQKnNrfAQjTnrVZSIxXuvaMaw-7uQV31aWQuD_l87K94CYdc4ulg9mfWBbYYVzY0QPLv6oHXm7wRVISi-T55XcghNSTQnnIg5AF_W8rSRJMoGar4R1e_zwOEtsTyXbewhtPtr2gye01XHWyDL0hoiF0qCAIYwgFsoZDSrOZO8Steh458FT54dEe2JUYmfnuCJqQ9Ui6c83ImSI8qlHYrgB-z10BHfs0gkGuH6_XJtal_EYDnGW16zg8qsdA-0KnbWHrIdyz_By872ABvtX1E6dr8vpqQ16-1AtYuO1SBoklgTu6HUzQIYEgPQSwHGwN4lp4iRFJBcnY9Cyu2jz7h67sLQdjqZWb2JVOy2CvVP4rZk6azlz7-lkmJYNvhSLi5Sil_O6Lki3d-gUXwfSluw3G_if0AWe-mE50D2iQiaZMItz7f0Amm3eJ5l3m0p8XydCiO9ZRcf9xsXRL4rwXE3U0K4ZXCdOG4sXpQQvF9KuZ5U33fj3djoXW6jYtw3Z7w_pHzg_wDfanoMXKZ7qmWJor3sTg0iQhFGYzTFIIiJ_mGQuFVAr0u28VLLKCuOm2iTPdzw7KdvtpMEjNQmS7H8fG5hZ3e11f15tNO8NYCDmlSiK5cnK9OetsRYFlmm-h0LNFpS_BP5seImkkCLztU6xuzj5lnik3udyVy3FLjrNJt6ftCP8o-SPAq2TumzJ_Mp2TYpa6ZKy6GCUu78OCAMBPJcnaLVMy13OOL-XyV5A0SPry7TuKl7PHn1R9jo3ui0Uat9Q',
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
