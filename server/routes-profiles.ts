// Profile routes: hatch (POST), the view read, and the edit-locator CRUD.
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  EDIT_TOKEN_HEADER,
  NEW_EDIT_TOKEN_HEADER,
  HATCH_LOCATOR_RE,
} from '../libs/core/src/hatch/hatch-api.ts';
import { send, sendError, type RouteContext } from './http-util.ts';

export async function handleProfiles(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  const profiles = ctx.opts.profiles;

  // POST /v2/profiles — hatch. Locators are client-derived; a collision
  // means the phrase is taken (astronomically unlikely) and the client
  // remints. INSERT ON CONFLICT leaves no pre-registration window to squat.
  if (pathname === '/v2/profiles' && method === 'POST') {
    if (ctx.opts.maxProfiles !== undefined && profiles.count() >= ctx.opts.maxProfiles) {
      sendError(res, 503, 'at_capacity');
      return true;
    }
    const tokenHash = ctx.tokenHashFrom(req, EDIT_TOKEN_HEADER);
    if (!tokenHash) {
      sendError(res, 400, 'bad_request', { message: 'missing or malformed edit token' });
      return true;
    }
    const body = await ctx.readJson(req, res);
    if (!body) return true;
    const viewLocator = body['view_locator'];
    const editLocator = body['edit_locator'];
    if (
      typeof viewLocator !== 'string' ||
      !HATCH_LOCATOR_RE.test(viewLocator) ||
      typeof editLocator !== 'string' ||
      !HATCH_LOCATOR_RE.test(editLocator) ||
      viewLocator === editLocator
    ) {
      sendError(res, 400, 'bad_request', { message: 'malformed locators' });
      return true;
    }
    if (!ctx.validBlob(body['blob_view']) || !ctx.validBlob(body['blob_priv'])) {
      sendError(res, 400, 'bad_request', { message: 'blobs must be base64url' });
      return true;
    }
    const outcome = profiles.create(
      viewLocator,
      editLocator,
      tokenHash,
      body['blob_view'],
      body['blob_priv'],
    );
    if (outcome === 'created') send(res, 201, { version: 1 });
    else sendError(res, 409, 'locator_taken');
    return true;
  }

  const viewMatch = pathname.match(/^\/v2\/profiles\/view\/([^/]+)$/);
  if (viewMatch && method === 'GET') {
    if (!HATCH_LOCATOR_RE.test(viewMatch[1])) {
      sendError(res, 400, 'bad_request', { message: 'malformed locator' });
      return true;
    }
    const record = profiles.getView(viewMatch[1]);
    if (!record) sendError(res, 404, 'not_found');
    else send(res, 200, record);
    return true;
  }

  const editMatch = pathname.match(/^\/v2\/profiles\/edit\/([^/]+)$/);
  if (!editMatch) return false;
  const editLocator = editMatch[1];
  if (!HATCH_LOCATOR_RE.test(editLocator)) {
    sendError(res, 400, 'bad_request', { message: 'malformed locator' });
    return true;
  }

  // The edit locator is itself a capability (128-bit, derived from the
  // edit phrase); reads need no token — the blobs are ciphertext anyway.
  if (method === 'GET') {
    const record = profiles.getEdit(editLocator);
    if (!record) sendError(res, 404, 'not_found');
    else send(res, 200, record);
    return true;
  }

  const tokenHash = ctx.tokenHashFrom(req, EDIT_TOKEN_HEADER);
  if (!tokenHash) {
    sendError(res, 400, 'bad_request', { message: 'missing or malformed edit token' });
    return true;
  }

  if (method === 'DELETE') {
    const outcome = profiles.delete(editLocator, tokenHash);
    if (outcome === 'deleted') send(res, 204);
    else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
    else sendError(res, 404, 'not_found');
    return true;
  }

  if (method === 'PUT') {
    const ifVersion = ctx.parseIfMatch(req, res);
    if (ifVersion === null) return true;
    const body = await ctx.readJson(req, res);
    if (!body) return true;
    if (!ctx.validBlob(body['blob_view']) || !ctx.validBlob(body['blob_priv'])) {
      sendError(res, 400, 'bad_request', { message: 'blobs must be base64url' });
      return true;
    }
    if (typeof body['populated'] !== 'boolean') {
      sendError(res, 400, 'bad_request', { message: 'populated must be boolean' });
      return true;
    }
    const newViewLocator = body['new_view_locator'];
    if (
      newViewLocator !== undefined &&
      (typeof newViewLocator !== 'string' || !HATCH_LOCATOR_RE.test(newViewLocator))
    ) {
      sendError(res, 400, 'bad_request', { message: 'malformed new_view_locator' });
      return true;
    }
    const newEditLocator = body['new_edit_locator'];
    let newEditTokenHash: string | undefined;
    if (newEditLocator !== undefined) {
      if (typeof newEditLocator !== 'string' || !HATCH_LOCATOR_RE.test(newEditLocator)) {
        sendError(res, 400, 'bad_request', { message: 'malformed new_edit_locator' });
        return true;
      }
      // A new edit identity is a locator + token pair; both derive from
      // the new phrase, so both must arrive together.
      const hash = ctx.tokenHashFrom(req, NEW_EDIT_TOKEN_HEADER);
      if (!hash) {
        sendError(res, 400, 'bad_request', {
          message: `new_edit_locator requires ${NEW_EDIT_TOKEN_HEADER}`,
        });
        return true;
      }
      newEditTokenHash = hash;
    }

    const outcome = profiles.put(editLocator, tokenHash, ifVersion, {
      blob_view: body['blob_view'],
      blob_priv: body['blob_priv'],
      populated: body['populated'],
      newViewLocator: newViewLocator as string | undefined,
      newEditLocator: newEditLocator as string | undefined,
      newEditTokenHash,
    });
    switch (outcome.status) {
      case 'updated':
        send(res, 200, { version: outcome.version });
        return true;
      case 'conflict':
        sendError(res, 409, 'version_conflict', {
          version: outcome.version,
          blob_view: outcome.blob_view,
          blob_priv: outcome.blob_priv,
        });
        return true;
      case 'bad_token':
        sendError(res, 401, 'bad_token');
        return true;
      case 'not_found':
        sendError(res, 404, 'not_found');
        return true;
      case 'locator_taken':
        sendError(res, 409, 'locator_taken');
        return true;
    }
  }

  sendError(res, 400, 'bad_request', { message: `unsupported method ${method}` });
  return true;
}
