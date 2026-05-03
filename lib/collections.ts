/**
 * Keyed Collection Utilities for Schema v2
 *
 * Provides O(1) lookup for collections that were previously arrays.
 * This eliminates linear search and enables direct access by ID.
 *
 * Pattern: { byId: { [id]: item }, order: [id1, id2, ...] }
 *
 * @module lib/collections
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Keyed collection with O(1) lookup and preserved order
 * @template T - Type of items in the collection
 */
export type KeyedCollection<T> = {
  byId: Record<string, T>;
  order: string[];
  count: number;
};

/**
 * Type constraint for items that can be used in a keyed collection
 * Items must have a key field for indexing
 */
export type Keyed<K extends string = 'id'> = Record<K, string>;

/**
 * Mustache-compatible collection with iteration helpers
 * @template T - Type of items in the collection
 */
export type MustacheCollection<T> = KeyedCollection<T> & {
  items: T[];
  hasItems: boolean;
  isEmpty: boolean;
  first: T | null;
  last: T | null;
};

// =============================================================================
// COLLECTION CREATION
// =============================================================================

/**
 * Create a keyed collection from an array of items
 *
 * @template T - Type of items with key field
 * @param items - Array of items with ID field
 * @param keyField - Field name to use as key (defaults to 'id')
 * @returns Keyed collection with byId map and order array
 *
 * @example
 * const measurements = [
 *   { id: 'sla_time', name: 'SLA Response Time', value: 4 },
 *   { id: 'monthly_bleed', name: 'Monthly Bleed', value: 2750 }
 * ];
 *
 * const metrics = createKeyedCollection(measurements);
 * // => {
 * //   byId: {
 * //     'sla_time': { id: 'sla_time', name: 'SLA Response Time', value: 4 },
 * //     'monthly_bleed': { id: 'monthly_bleed', name: 'Monthly Bleed', value: 2750 }
 * //   },
 * //   order: ['sla_time', 'monthly_bleed'],
 * //   count: 2
 * // }
 */
export function createKeyedCollection<T extends Record<string, any>>(
  items: T[],
  keyField: string = 'id'
): KeyedCollection<T> {
  if (!Array.isArray(items)) {
    return { byId: {}, order: [], count: 0 };
  }

  const byId: Record<string, T> = {};
  const order: string[] = [];

  for (const item of items) {
    if (item && item[keyField]) {
      const key = String(item[keyField]);
      byId[key] = item;
      order.push(key);
    }
  }

  return {
    byId,
    order,
    count: order.length
  };
}

/**
 * Create an empty keyed collection
 *
 * @template T - Type of items that will be stored
 * @returns Empty keyed collection
 */
export function emptyCollection<T>(): KeyedCollection<T> {
  return { byId: {}, order: [], count: 0 };
}

// =============================================================================
// COLLECTION ACCESS
// =============================================================================

/**
 * Get an item from a keyed collection by ID
 *
 * @template T - Type of items in collection
 * @param collection - Keyed collection
 * @param id - Item ID to retrieve
 * @returns Item or null if not found
 */
export function getFromCollection<T>(
  collection: KeyedCollection<T> | null | undefined,
  id: string
): T | null {
  return collection?.byId?.[id] || null;
}

/**
 * Get all items from a keyed collection in order
 *
 * @template T - Type of items in collection
 * @param collection - Keyed collection
 * @returns Items in original order
 */
export function getAllFromCollection<T>(
  collection: KeyedCollection<T> | null | undefined
): T[] {
  if (!collection?.byId || !collection?.order) {
    return [];
  }
  return collection.order.map(id => collection.byId[id]).filter(Boolean);
}

/**
 * Check if a keyed collection contains an item
 *
 * @template T - Type of items in collection
 * @param collection - Keyed collection
 * @param id - Item ID to check
 * @returns True if item exists in collection
 */
export function hasInCollection<T>(
  collection: KeyedCollection<T> | null | undefined,
  id: string
): boolean {
  return Boolean(collection?.byId?.[id]);
}

/**
 * Convert a keyed collection back to an array
 *
 * @template T - Type of items in collection
 * @param collection - Keyed collection
 * @returns Items in original order
 */
export function toArray<T>(collection: KeyedCollection<T> | null | undefined): T[] {
  return getAllFromCollection(collection);
}

// =============================================================================
// COLLECTION MUTATION
// =============================================================================

/**
 * Add an item to a keyed collection
 *
 * @template T - Type of items in collection
 * @param collection - Keyed collection to modify
 * @param item - Item to add
 * @param keyField - Field name to use as key (defaults to 'id')
 * @returns Modified collection
 */
export function addToCollection<T extends Record<string, any>>(
  collection: KeyedCollection<T>,
  item: T,
  keyField: string = 'id'
): KeyedCollection<T> {
  if (!item || !item[keyField]) {
    return collection;
  }

  const key = String(item[keyField]);

  // If key doesn't exist, add to order
  if (!collection.byId[key]) {
    collection.order.push(key);
    collection.count = collection.order.length;
  }

  collection.byId[key] = item;
  return collection;
}

/**
 * Remove an item from a keyed collection by ID
 *
 * @template T - Type of items in collection
 * @param collection - Keyed collection to modify
 * @param id - Item ID to remove
 * @returns Modified collection
 */
export function removeFromCollection<T>(
  collection: KeyedCollection<T>,
  id: string
): KeyedCollection<T> {
  if (!collection?.byId?.[id]) {
    return collection;
  }

  Reflect.deleteProperty(collection.byId, id);
  collection.order = collection.order.filter(key => key !== id);
  collection.count = collection.order.length;

  return collection;
}

/**
 * Merge two keyed collections
 * Items in second collection override items in first if keys match
 *
 * @template T - Type of items in collection
 * @param first - First keyed collection
 * @param second - Second keyed collection (takes precedence)
 * @returns Merged collection
 */
export function mergeCollections<T>(
  first: KeyedCollection<T> | null | undefined,
  second: KeyedCollection<T> | null | undefined
): KeyedCollection<T> {
  const merged: KeyedCollection<T> = {
    byId: { ...first?.byId, ...second?.byId },
    order: [],
    count: 0
  };

  // Maintain order: first collection items, then new items from second
  const seen = new Set<string>();

  for (const id of (first?.order || [])) {
    if (!seen.has(id)) {
      merged.order.push(id);
      seen.add(id);
    }
  }

  for (const id of (second?.order || [])) {
    if (!seen.has(id)) {
      merged.order.push(id);
      seen.add(id);
    }
  }

  merged.count = merged.order.length;
  return merged;
}

// =============================================================================
// FUNCTIONAL OPERATIONS
// =============================================================================

/**
 * Filter a keyed collection
 *
 * @template T - Type of items in collection
 * @param collection - Keyed collection
 * @param predicate - Filter function (item) => boolean
 * @returns Filtered keyed collection
 */
export function filterCollection<T>(
  collection: KeyedCollection<T> | null | undefined,
  predicate: (item: T) => boolean
): KeyedCollection<T> {
  const filtered = emptyCollection<T>();

  for (const id of (collection?.order || [])) {
    const item = collection?.byId[id];
    if (item && predicate(item)) {
      filtered.byId[id] = item;
      filtered.order.push(id);
    }
  }

  filtered.count = filtered.order.length;
  return filtered;
}

/**
 * Map over a keyed collection
 *
 * @template T - Type of items in input collection
 * @template U - Type of items in output collection
 * @param collection - Keyed collection
 * @param mapper - Map function (item, id) => newItem
 * @param keyField - Key field in mapped items (defaults to 'id')
 * @returns Mapped keyed collection
 */
export function mapCollection<T, U extends Record<string, any>>(
  collection: KeyedCollection<T> | null | undefined,
  mapper: (item: T, id: string) => U,
  keyField: string = 'id'
): KeyedCollection<U> {
  const mapped = emptyCollection<U>();

  for (const id of (collection?.order || [])) {
    const item = collection?.byId[id];
    if (item) {
      const newItem = mapper(item, id);
      if (newItem && newItem[keyField]) {
        const newKey = String(newItem[keyField]);
        mapped.byId[newKey] = newItem;
        mapped.order.push(newKey);
      }
    }
  }

  mapped.count = mapped.order.length;
  return mapped;
}

// =============================================================================
// TEMPLATE HELPERS
// =============================================================================

/**
 * Create a Mustache-compatible collection
 * Adds helper arrays for iteration in templates
 *
 * @template T - Type of items in collection
 * @param collection - Keyed collection
 * @returns Collection with Mustache iteration helpers
 *
 * @example
 * const mustacheMetrics = toMustacheCollection(metrics);
 * // Template: {{#metrics.items}}{{name}}: {{value}}{{/metrics.items}}
 */
export function toMustacheCollection<T>(
  collection: KeyedCollection<T> | null | undefined
): MustacheCollection<T> {
  const items = getAllFromCollection(collection);

  return {
    ...(collection || emptyCollection<T>()),
    items,
    hasItems: items.length > 0,
    isEmpty: items.length === 0,
    first: items[0] || null,
    last: items.at(-1) || null
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createKeyedCollection,
  getFromCollection,
  getAllFromCollection,
  addToCollection,
  removeFromCollection,
  hasInCollection,
  toArray,
  emptyCollection,
  mergeCollections,
  filterCollection,
  mapCollection,
  toMustacheCollection
};
