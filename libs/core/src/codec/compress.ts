/**
 * deflate-raw both ways, over the Streams API and nothing else.
 *
 * The obvious spelling of this — wrap the bytes in a Blob, pipe `.stream()`
 * through, drain with `new Response(...)` — pulls in two APIs that have no
 * business here and are the least portable links in the chain: jsdom, for
 * one, ships CompressionStream but no `Blob.prototype.stream`, which made
 * every encrypted blob unusable in the app's own test environment. Feeding
 * the transform's writable side directly and draining its readable side is
 * the same deflate-raw byte for byte, and depends only on the streams the
 * transform itself is made of.
 */
async function pipeThrough(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Deliberately not awaited: a transform stream only accepts what someone is
  // draining, so writing and reading have to overlap or the two sides wait on
  // each other forever.
  const written = writer.write(bytes as BufferSource).then(() => writer.close());

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await written;

  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new CompressionStream('deflate-raw'));
}

export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new DecompressionStream('deflate-raw'));
}
