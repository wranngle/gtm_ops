/**
 * Unit tests for lib/collections.ts — keyed-collection utilities
 * (`{ byId, order, count }` shape with O(1) lookup + preserved order).
 * The module had no test file. These helpers are used through the
 * Schema v2 pipeline (extract.js, template_context.js, etc.) — a
 * regression that drops the order array would silently change
 * iteration order in proposal templates and PDFs.
 */
import { describe, expect, it, beforeEach } from 'vitest';

let createKeyedCollection: any;
let emptyCollection: any;
let getFromCollection: any;
let getAllFromCollection: any;
let hasInCollection: any;
let toArray: any;
let addToCollection: any;
let removeFromCollection: any;
let mergeCollections: any;
let filterCollection: any;
let mapCollection: any;
let toMustacheCollection: any;

beforeEach(async () => {
  const mod: any = await import('../../lib/collections.js');
  ({
    createKeyedCollection,
    emptyCollection,
    getFromCollection,
    getAllFromCollection,
    hasInCollection,
    toArray,
    addToCollection,
    removeFromCollection,
    mergeCollections,
    filterCollection,
    mapCollection,
    toMustacheCollection,
  } = mod);
});

describe('[P0] createKeyedCollection / emptyCollection', () => {
  it('[P0] should build {byId, order, count} from an array', () => {
    const c = createKeyedCollection([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
    expect(c.byId.a).toEqual({ id: 'a', name: 'A' });
    expect(c.byId.b).toEqual({ id: 'b', name: 'B' });
    expect(c.order).toEqual(['a', 'b']);
    expect(c.count).toBe(2);
  });

  it('[P0] should preserve insertion order across many items', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, n: i }));
    const c = createKeyedCollection(items);
    expect(c.order).toEqual(items.map((x) => x.id));
  });

  it('[P0] should accept a custom keyField', () => {
    const c = createKeyedCollection(
      [
        { slug: 'foo', val: 1 },
        { slug: 'bar', val: 2 },
      ],
      'slug',
    );
    expect(c.byId.foo.val).toBe(1);
    expect(c.order).toEqual(['foo', 'bar']);
  });

  it('[P1] should skip items missing the key field', () => {
    const c = createKeyedCollection([
      { id: 'a', val: 1 },
      { val: 2 } as any, // no id
      { id: 'b', val: 3 },
    ]);
    expect(c.count).toBe(2);
    expect(c.order).toEqual(['a', 'b']);
  });

  it('[P1] should return an empty collection for non-array input', () => {
    expect(createKeyedCollection(null as any)).toEqual({ byId: {}, order: [], count: 0 });
    expect(createKeyedCollection(undefined as any)).toEqual({ byId: {}, order: [], count: 0 });
    expect(emptyCollection()).toEqual({ byId: {}, order: [], count: 0 });
  });
});

describe('[P0] read helpers', () => {
  it('[P0] getFromCollection returns the item or null', () => {
    const c = createKeyedCollection([{ id: 'a', val: 1 }]);
    expect(getFromCollection(c, 'a')).toEqual({ id: 'a', val: 1 });
    expect(getFromCollection(c, 'missing')).toBeNull();
    expect(getFromCollection(null, 'a')).toBeNull();
  });

  it('[P0] getAllFromCollection returns items in order', () => {
    const c = createKeyedCollection([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 3 },
    ]);
    expect(getAllFromCollection(c).map((x: any) => x.n)).toEqual([1, 2, 3]);
  });

  it('[P0] hasInCollection returns boolean', () => {
    const c = createKeyedCollection([{ id: 'a', val: 1 }]);
    expect(hasInCollection(c, 'a')).toBe(true);
    expect(hasInCollection(c, 'missing')).toBe(false);
    expect(hasInCollection(null, 'a')).toBe(false);
  });

  it('[P0] toArray is an alias for getAllFromCollection', () => {
    const c = createKeyedCollection([{ id: 'a', val: 1 }]);
    expect(toArray(c)).toEqual(getAllFromCollection(c));
  });
});

describe('[P0] mutation helpers', () => {
  it('[P0] addToCollection appends a new item and bumps count', () => {
    const c = createKeyedCollection([{ id: 'a', val: 1 }]);
    addToCollection(c, { id: 'b', val: 2 });
    expect(c.order).toEqual(['a', 'b']);
    expect(c.count).toBe(2);
    expect(c.byId.b.val).toBe(2);
  });

  it('[P0] addToCollection on existing key replaces value, leaves order alone', () => {
    const c = createKeyedCollection([{ id: 'a', val: 1 }]);
    addToCollection(c, { id: 'a', val: 99 });
    expect(c.order).toEqual(['a']);
    expect(c.count).toBe(1);
    expect(c.byId.a.val).toBe(99);
  });

  it('[P1] addToCollection ignores items without the key field', () => {
    const c = createKeyedCollection([{ id: 'a', val: 1 }]);
    addToCollection(c, { val: 2 });
    expect(c.count).toBe(1);
  });

  it('[P0] removeFromCollection drops the item and adjusts order/count', () => {
    const c = createKeyedCollection([
      { id: 'a', val: 1 },
      { id: 'b', val: 2 },
      { id: 'c', val: 3 },
    ]);
    removeFromCollection(c, 'b');
    expect(c.order).toEqual(['a', 'c']);
    expect(c.count).toBe(2);
    expect(c.byId.b).toBeUndefined();
  });

  it('[P1] removeFromCollection on missing id is a no-op', () => {
    const c = createKeyedCollection([{ id: 'a', val: 1 }]);
    removeFromCollection(c, 'missing');
    expect(c.count).toBe(1);
  });
});

describe('[P0] mergeCollections - second wins, order preserved', () => {
  it('[P0] should overlay second on first when ids overlap', () => {
    const first = createKeyedCollection([
      { id: 'a', val: 1 },
      { id: 'b', val: 2 },
    ]);
    const second = createKeyedCollection([
      { id: 'b', val: 22 },
      { id: 'c', val: 3 },
    ]);
    const merged = mergeCollections(first, second);
    expect(merged.byId.a.val).toBe(1);
    expect(merged.byId.b.val).toBe(22); // second wins
    expect(merged.byId.c.val).toBe(3);
    // First's order respected, then second's new ids appended.
    expect(merged.order).toEqual(['a', 'b', 'c']);
    expect(merged.count).toBe(3);
  });

  it('[P1] should tolerate null / undefined inputs', () => {
    const c = createKeyedCollection([{ id: 'a', val: 1 }]);
    expect(mergeCollections(c, null).order).toEqual(['a']);
    expect(mergeCollections(null, c).order).toEqual(['a']);
    expect(mergeCollections(null, null)).toEqual({ byId: {}, order: [], count: 0 });
  });
});

describe('[P0] filterCollection / mapCollection', () => {
  it('[P0] filterCollection should keep matching items in order', () => {
    const c = createKeyedCollection([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 3 },
    ]);
    const evens = filterCollection(c, (item: any) => item.n % 2 === 0);
    expect(evens.order).toEqual(['b']);
    expect(evens.count).toBe(1);
  });

  it('[P0] mapCollection should transform values, preserving order', () => {
    const c = createKeyedCollection([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
    const doubled = mapCollection(c, (item: any) => ({ id: item.id, n: item.n * 2 }));
    expect(doubled.byId.a.n).toBe(2);
    expect(doubled.byId.b.n).toBe(4);
    expect(doubled.order).toEqual(['a', 'b']);
  });

  it('[P1] mapCollection should support changing the key field via mapper output', () => {
    const c = createKeyedCollection([{ id: 'a', n: 1 }]);
    const remapped = mapCollection(c, (item: any) => ({ id: `prefixed_${item.id}`, n: item.n }));
    expect(remapped.order).toEqual(['prefixed_a']);
    expect(remapped.byId.prefixed_a.n).toBe(1);
  });
});

describe('[P1] toMustacheCollection', () => {
  it('[P1] should add items / hasItems / isEmpty / first / last', () => {
    const c = createKeyedCollection([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 3 },
    ]);
    const m = toMustacheCollection(c);
    expect(m.items.map((x: any) => x.id)).toEqual(['a', 'b', 'c']);
    expect(m.hasItems).toBe(true);
    expect(m.isEmpty).toBe(false);
    expect(m.first.id).toBe('a');
    expect(m.last.id).toBe('c');
  });

  it('[P1] should mark empty collections cleanly', () => {
    const m = toMustacheCollection(emptyCollection());
    expect(m.items).toEqual([]);
    expect(m.hasItems).toBe(false);
    expect(m.isEmpty).toBe(true);
    expect(m.first).toBeNull();
    expect(m.last).toBeNull();
  });
});
