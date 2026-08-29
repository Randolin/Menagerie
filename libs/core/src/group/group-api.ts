// Group API wire types (v1). Deliberately dependency-free: the server
// imports this file relatively (TS path aliases don't resolve under plain
// Node), so nothing here may import anything at all.
//
// A group is one encrypted roster: a meta blob plus one deposit blob per
// member, all ciphertext under a key derived from the shared group phrase.
// The creator's separate admin phrase derives the admin token (manage,
// kick, re-key, delete); each member holds a random locator+token pair for
// their own deposit. The server sees locators, token hashes, ciphertext,
// and — unavoidably in this model — how many members a group has.

export interface CreateGroupRequest {
  group_locator: string;
  blob_meta: string;
}

export interface GroupMemberRecord {
  member_locator: string;
  blob_member: string;
  version: number;
}

export interface GroupRecord {
  blob_meta: string;
  version: number;
  members: GroupMemberRecord[];
}

export interface PutGroupRequest {
  blob_meta: string;
  /** Atomic re-key (re-mint): the roster moves to a new locator. */
  new_group_locator?: string;
}

export interface JoinGroupRequest {
  member_locator: string;
  blob_member: string;
}

export interface PutMemberRequest {
  blob_member: string;
}

/** Manage/kick/re-key/delete credential (creator's admin phrase). */
export const ADMIN_TOKEN_HEADER = 'x-menagerie-admin-token';
/** A member's own deposit credential (random, stored in their PrivData). */
export const MEMBER_TOKEN_HEADER = 'x-menagerie-member-token';
/** With re-keying, the group's new admin token arrives alongside. */
export const NEW_ADMIN_TOKEN_HEADER = 'x-menagerie-new-admin-token';

/** Hard cap on deposits per group. */
export const GROUP_MAX_MEMBERS = 32;

export interface PutGroupResponse {
  version: number;
}

export interface PutMemberResponse {
  version: number;
}
