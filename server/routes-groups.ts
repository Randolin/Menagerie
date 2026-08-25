// Group routes: create, join, member update/remove, roster read, admin
// update/delete.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HATCH_LOCATOR_RE } from '../libs/core/src/hatch/hatch-api.ts';
import {
  ADMIN_TOKEN_HEADER,
  MEMBER_TOKEN_HEADER,
  NEW_ADMIN_TOKEN_HEADER,
} from '../libs/core/src/group/group-api.ts';
import { send, sendError, type RouteContext } from './http-util.ts';

export async function handleGroups(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  // POST /v2/groups — create a roster. Locator is client-derived from
  // the group phrase; the admin token comes from the creator's separate
  // admin phrase.
  if (pathname === '/v2/groups' && method === 'POST') {
    if (ctx.opts.maxGroups !== undefined && ctx.opts.groups.count() >= ctx.opts.maxGroups) {
      sendError(res, 503, 'at_capacity');
      return true;
    }
    const adminHash = ctx.tokenHashFrom(req, ADMIN_TOKEN_HEADER);
    if (!adminHash) {
      sendError(res, 400, 'bad_request', { message: 'missing or malformed admin token' });
      return true;
    }
    const body = await ctx.readJson(req, res);
    if (!body) return true;
    const groupLocator = body['group_locator'];
    if (typeof groupLocator !== 'string' || !HATCH_LOCATOR_RE.test(groupLocator)) {
      sendError(res, 400, 'bad_request', { message: 'malformed group locator' });
      return true;
    }
    if (!ctx.validBlob(body['blob_meta'])) {
      sendError(res, 400, 'bad_request', { message: 'blob_meta must be base64url' });
      return true;
    }
    const outcome = ctx.opts.groups.create(groupLocator, adminHash, body['blob_meta']);
    if (outcome === 'created') send(res, 201, { version: 1 });
    else sendError(res, 409, 'locator_taken');
    return true;
  }

  // POST /v2/groups/:g/members — join: deposit a member blob under a
  // random member locator; its token (hashed here) is the member's own
  // update/leave capability.
  const joinMatch = pathname.match(/^\/v2\/groups\/([^/]+)\/members$/);
  if (joinMatch && method === 'POST') {
    if (!HATCH_LOCATOR_RE.test(joinMatch[1])) {
      sendError(res, 400, 'bad_request', { message: 'malformed locator' });
      return true;
    }
    const memberHash = ctx.tokenHashFrom(req, MEMBER_TOKEN_HEADER);
    if (!memberHash) {
      sendError(res, 400, 'bad_request', { message: 'missing or malformed member token' });
      return true;
    }
    const body = await ctx.readJson(req, res);
    if (!body) return true;
    const memberLocator = body['member_locator'];
    if (typeof memberLocator !== 'string' || !HATCH_LOCATOR_RE.test(memberLocator)) {
      sendError(res, 400, 'bad_request', { message: 'malformed member locator' });
      return true;
    }
    if (!ctx.validBlob(body['blob_member'])) {
      sendError(res, 400, 'bad_request', { message: 'blob_member must be base64url' });
      return true;
    }
    const outcome = ctx.opts.groups.join(
      joinMatch[1],
      memberLocator,
      memberHash,
      body['blob_member'],
    );
    if (outcome === 'joined') send(res, 201, { version: 1 });
    else if (outcome === 'group_not_found') sendError(res, 404, 'not_found');
    else if (outcome === 'full') sendError(res, 503, 'at_capacity');
    else sendError(res, 409, 'locator_taken');
    return true;
  }

  // /v2/groups/:g/members/:m — a member updates or removes their own
  // deposit (member token); an admin token may also remove it (kick).
  const memberMatch = pathname.match(/^\/v2\/groups\/([^/]+)\/members\/([^/]+)$/);
  if (memberMatch) {
    const memberLocator = memberMatch[2];
    if (!HATCH_LOCATOR_RE.test(memberMatch[1]) || !HATCH_LOCATOR_RE.test(memberLocator)) {
      sendError(res, 400, 'bad_request', { message: 'malformed locator' });
      return true;
    }
    if (method === 'DELETE') {
      const hash =
        ctx.tokenHashFrom(req, MEMBER_TOKEN_HEADER) ?? ctx.tokenHashFrom(req, ADMIN_TOKEN_HEADER);
      if (!hash) {
        sendError(res, 400, 'bad_request', { message: 'missing member or admin token' });
        return true;
      }
      const outcome = ctx.opts.groups.deleteMember(memberLocator, hash);
      if (outcome === 'deleted') send(res, 204);
      else if (outcome === 'bad_token') sendError(res, 401, 'bad_token');
      else sendError(res, 404, 'not_found');
      return true;
    }
    if (method === 'PUT') {
      const memberHash = ctx.tokenHashFrom(req, MEMBER_TOKEN_HEADER);
      if (!memberHash) {
        sendError(res, 400, 'bad_request', { message: 'missing or malformed member token' });
        return true;
      }
      const ifVersion = ctx.parseIfMatch(req, res);
      if (ifVersion === null) return true;
      const body = await ctx.readJson(req, res);
      if (!body) return true;
      if (!ctx.validBlob(body['blob_member'])) {
        sendError(res, 400, 'bad_request', { message: 'blob_member must be base64url' });
        return true;
      }
      const outcome = ctx.opts.groups.putMember(
        memberLocator,
        memberHash,
        ifVersion,
        body['blob_member'],
      );
      if (outcome.status === 'updated') send(res, 200, { version: outcome.version });
      else if (outcome.status === 'bad_token') sendError(res, 401, 'bad_token');
      else if (outcome.status === 'conflict')
        sendError(res, 409, 'version_conflict', {
          version: outcome.version,
          blob_member: outcome.blob_member,
        });
      else sendError(res, 404, 'not_found');
      return true;
    }
    sendError(res, 400, 'bad_request', { message: `unsupported method ${method}` });
    return true;
  }

  // /v2/groups/:g — read the roster (the locator is the capability),
  // or admin-update / admin-delete it.
  const groupMatch = pathname.match(/^\/v2\/groups\/([^/]+)$/);
  if (!groupMatch) return false;
  const groupLocator = groupMatch[1];
  if (!HATCH_LOCATOR_RE.test(groupLocator)) {
    sendError(res, 400, 'bad_request', { message: 'malformed locator' });
    return true;
  }
  if (method === 'GET') {
    const record = ctx.opts.groups.get(groupLocator);
    if (!record) sendError(res, 404, 'not_found');
    else send(res, 200, record);
    return true;
  }
  const adminHash = ctx.tokenHashFrom(req, ADMIN_TOKEN_HEADER);
  if (!adminHash) {
    sendError(res, 400, 'bad_request', { message: 'missing or malformed admin token' });
    return true;
  }
  if (method === 'DELETE') {
    const outcome = ctx.opts.groups.delete(groupLocator, adminHash);
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
    if (!ctx.validBlob(body['blob_meta'])) {
      sendError(res, 400, 'bad_request', { message: 'blob_meta must be base64url' });
      return true;
    }
    const newGroupLocator = body['new_group_locator'];
    let newAdminTokenHash: string | undefined;
    if (newGroupLocator !== undefined) {
      if (typeof newGroupLocator !== 'string' || !HATCH_LOCATOR_RE.test(newGroupLocator)) {
        sendError(res, 400, 'bad_request', { message: 'malformed new_group_locator' });
        return true;
      }
      const hash = ctx.tokenHashFrom(req, NEW_ADMIN_TOKEN_HEADER);
      if (!hash) {
        sendError(res, 400, 'bad_request', {
          message: `new_group_locator requires ${NEW_ADMIN_TOKEN_HEADER}`,
        });
        return true;
      }
      newAdminTokenHash = hash;
    }
    const outcome = ctx.opts.groups.put(groupLocator, adminHash, ifVersion, {
      blob_meta: body['blob_meta'],
      newGroupLocator: newGroupLocator as string | undefined,
      newAdminTokenHash,
    });
    switch (outcome.status) {
      case 'updated':
        send(res, 200, { version: outcome.version });
        return true;
      case 'conflict':
        sendError(res, 409, 'version_conflict', {
          version: outcome.version,
          blob_meta: outcome.blob_meta,
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
