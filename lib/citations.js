/**
 * Citations Utility
 *
 * Generates HTML footnotes from research citations for use in
 * the Technical Approach section of presales documents.
 *
 * @module lib/citations
 */

// =============================================================================
// FOOTNOTE HTML GENERATOR
// =============================================================================

/**
 * Generate HTML footnotes from collected citations
 *
 * @param {Array<Object>} citations - Array of citation objects
 * @param {number} citations[].id - Unique citation ID
 * @param {string} citations[].integration - Integration name this citation is for
 * @param {string} citations[].url - Source URL
 * @param {string} citations[].title - Source title (optional)
 * @param {string} citations[].source - Source name (e.g., "n8n docs", "API docs")
 * @param {string} citations[].accessed - Access date (optional)
 * @returns {string} HTML string for footnotes section
 */
export function generateFootnotesHtml(citations) {
  if (!citations || !Array.isArray(citations) || citations.length === 0) {
    return '';
  }

  const footnoteItems = citations.map(cite => {
    const id = cite.id || 0;
    const url = cite.url || '#';
    const title = cite.title || cite.source || 'Source';
    const integration = cite.integration || '';
    const accessed = cite.accessed ? ` (accessed ${cite.accessed})` : '';

    // Create formatted footnote entry
    const integrationLabel = integration ? `<span class="cite-integration">[${integration}]</span> ` : '';

    return `<li id="fn-${id}" class="footnote-item">
      <sup>${id}</sup> ${integrationLabel}<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>${accessed}
    </li>`;
  });

  return `
<aside class="footnotes-section">
  <h4 class="footnotes-header">Research Citations</h4>
  <ol class="footnotes-list">
    ${footnoteItems.join('\n    ')}
  </ol>
</aside>`.trim();
}

/**
 * Generate inline citation reference
 *
 * @param {number} id - Citation ID
 * @returns {string} HTML for inline superscript reference
 */
export function generateCitationRef(id) {
  return `<sup class="cite-ref"><a href="#fn-${id}">[${id}]</a></sup>`;
}

/**
 * Format a single citation for display
 *
 * @param {Object} citation - Citation object
 * @returns {string} Formatted citation string
 */
export function formatCitation(citation) {
  if (!citation) return '';

  const parts = [];

  if (citation.title) {
    parts.push(`"${citation.title}"`);
  }

  if (citation.source) {
    parts.push(citation.source);
  }

  if (citation.url) {
    parts.push(citation.url);
  }

  if (citation.accessed) {
    parts.push(`accessed ${citation.accessed}`);
  }

  return parts.join(', ');
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Escape HTML special characters
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  generateFootnotesHtml,
  generateCitationRef,
  formatCitation
};
