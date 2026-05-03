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

/**
 * Create a keyed collection from an array of items
 *
 * @param {Array} items - Array of items with ID field
 * @param {string} [keyField='id'] - Field name to use as key
 * @returns {Object} Keyed collection with byId map and order array
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
export function createKeyedCollection(items, keyField = 'id') {
  if (!Array.isArray(items)) {
    return { byId: {}, order: [], count: 0 };
  }

  const byId = {};
  const order = [];

  for (const item of items) {
    if (item && item[keyField]) {
      const key = item[keyField];
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
 * Get an item from a keyed collection by ID
 *
 * @param {Object} collection - Keyed collection
 * @param {string} id - Item ID to retrieve
 * @returns {Object|null} Item or null if not found
 */
export function getFromCollection(collection, id) {
  return collection?.byId?.[id] || null;
}

/**
 * Get all items from a keyed collection in order
 *
 * @param {Object} collection - Keyed collection
 * @returns {Array} Items in original order
 */
export function getAllFromCollection(collection) {
  if (!collection?.byId || !collection?.order) {
    return [];
  }
  return collection.order.map(id => collection.byId[id]).filter(Boolean);
}

/**
 * Add an item to a keyed collection
 *
 * @param {Object} collection - Keyed collection to modify
 * @param {Object} item - Item to add
 * @param {string} [keyField='id'] - Field name to use as key
 * @returns {Object} Modified collection
 */
export function addToCollection(collection, item, keyField = 'id') {
  if (!item || !item[keyField]) {
    return collection;
  }

  const key = item[keyField];

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
 * @param {Object} collection - Keyed collection to modify
 * @param {string} id - Item ID to remove
 * @returns {Object} Modified collection
 */
export function removeFromCollection(collection, id) {
  if (!collection?.byId?.[id]) {
    return collection;
  }

  delete collection.byId[id];
  collection.order = collection.order.filter(key => key !== id);
  collection.count = collection.order.length;

  return collection;
}

/**
 * Check if a keyed collection contains an item
 *
 * @param {Object} collection - Keyed collection
 * @param {string} id - Item ID to check
 * @returns {boolean}
 */
export function hasInCollection(collection, id) {
  return Boolean(collection?.byId?.[id]);
}

/**
 * Convert a keyed collection back to an array
 *
 * @param {Object} collection - Keyed collection
 * @returns {Array} Items in original order
 */
export function toArray(collection) {
  return getAllFromCollection(collection);
}

/**
 * Create an empty keyed collection
 *
 * @returns {Object} Empty keyed collection
 */
export function emptyCollection() {
  return { byId: {}, order: [], count: 0 };
}

/**
 * Merge two keyed collections
 * Items in second collection override items in first if keys match
 *
 * @param {Object} first - First keyed collection
 * @param {Object} second - Second keyed collection (takes precedence)
 * @returns {Object} Merged collection
 */
export function mergeCollections(first, second) {
  const merged = {
    byId: { ...first?.byId, ...second?.byId },
    order: []
  };

  // Maintain order: first collection items, then new items from second
  const seen = new Set();

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

/**
 * Filter a keyed collection
 *
 * @param {Object} collection - Keyed collection
 * @param {Function} predicate - Filter function (item) => boolean
 * @returns {Object} Filtered keyed collection
 */
export function filterCollection(collection, predicate) {
  const filtered = emptyCollection();

  for (const id of (collection?.order || [])) {
    const item = collection.byId[id];
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
 * @param {Object} collection - Keyed collection
 * @param {Function} mapper - Map function (item, id) => newItem
 * @param {string} [keyField='id'] - Key field in mapped items
 * @returns {Object} Mapped keyed collection
 */
export function mapCollection(collection, mapper, keyField = 'id') {
  const mapped = emptyCollection();

  for (const id of (collection?.order || [])) {
    const item = collection.byId[id];
    if (item) {
      const newItem = mapper(item, id);
      if (newItem && newItem[keyField]) {
        mapped.byId[newItem[keyField]] = newItem;
        mapped.order.push(newItem[keyField]);
      }
    }
  }

  mapped.count = mapped.order.length;
  return mapped;
}

/**
 * Create a Mustache-compatible collection
 * Adds helper arrays for iteration in templates
 *
 * @param {Object} collection - Keyed collection
 * @returns {Object} Collection with Mustache iteration helpers
 *
 * @example
 * const mustacheMetrics = toMustacheCollection(metrics);
 * // Template: {{#metrics.items}}{{name}}: {{value}}{{/metrics.items}}
 */
export function toMustacheCollection(collection) {
  const items = getAllFromCollection(collection);

  return {
    ...collection,
    items,
    hasItems: items.length > 0,
    isEmpty: items.length === 0,
    first: items[0] || null,
    last: items[items.length - 1] || null
  };
}

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
