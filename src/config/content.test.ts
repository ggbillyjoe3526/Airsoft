import { describe, expect, it } from 'vitest';
import { availableChoice, CONTENT_TAGS, isAvailable, tagOf, type Tagged } from './content';

type Id = 'a' | 'b' | 'c';
const options: readonly (Tagged & { id: Id })[] = [{ id: 'a' }, { id: 'b', tag: 'public' }, { id: 'c', tag: 'dev' }];

describe('public and dev content tags (M35)', () => {
  it('knows two tags, public and dev', () => {
    expect(CONTENT_TAGS).toEqual(['public', 'dev']);
  });

  it('offers public (and untagged) content always, dev content only with Dev content on', () => {
    expect(isAvailable('public', false)).toBe(true);
    expect(isAvailable('public', true)).toBe(true);
    expect(isAvailable(undefined, false)).toBe(true);
    expect(isAvailable('dev', false)).toBe(false);
    expect(isAvailable('dev', true)).toBe(true);
  });

  it('plays a dev pick as the fallback while Dev content is off and as the pick while it is on', () => {
    expect(availableChoice(options, 'c', false, 'a')).toBe('a');
    expect(availableChoice(options, 'c', true, 'a')).toBe('c');
    expect(availableChoice(options, 'b', false, 'a')).toBe('b');
    expect(availableChoice(options, 'a', false, 'b')).toBe('a'); // untagged is public
  });

  it('plays an id the list does not hold as the fallback, with Dev content on or off', () => {
    expect(availableChoice(options, 'gone' as Id, false, 'b')).toBe('b');
    expect(availableChoice(options, 'gone' as Id, true, 'b')).toBe('b');
  });

  it('reads the tag of an option, public for an untagged or unlisted one', () => {
    expect(tagOf(options, 'c')).toBe('dev');
    expect(tagOf(options, 'b')).toBe('public');
    expect(tagOf(options, 'a')).toBe('public');
    expect(tagOf(options, 'gone' as Id)).toBe('public');
  });
});
