import { describe, expect, it } from 'vitest';
import { INVITE_BASE_URL, inviteLink, shareContent } from './invite';

const CODE = 'K7M9P';

describe('shareContent', () => {
  it('offers the invite link as the url, on the live site', () => {
    const r = shareContent(CODE, INVITE_BASE_URL, false);
    expect(r.url).toBe(inviteLink(CODE));
    expect(r.text).toContain(CODE);
  });
  it('carries online=1 for the invited friend when the online beta is on', () => {
    expect(shareContent(CODE, INVITE_BASE_URL, true).url).toBe(inviteLink(CODE, INVITE_BASE_URL, true));
  });
  it('accepts any base (developer mode shares this page)', () => {
    const base = 'https://example.com/petanque/';
    expect(shareContent(CODE, base, false).url).toBe(inviteLink(CODE, base));
  });
  it('has no url at all without a base (portals forbid links off their site)', () => {
    const r = shareContent(CODE, null, false);
    expect(r.url).toBeUndefined();
    expect(r.text).toContain(CODE);
  });
});
