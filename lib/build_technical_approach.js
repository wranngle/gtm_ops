/**
 * Technical Approach Builder
 * Constructs the technical_approach object for the Scope of Work template
 * from integration research data.
 */

/**
 * Default technology stack for n8n workflow automation projects
 */
const DEFAULT_TECHNOLOGY_STACK = [
  { name: 'n8n (Latest Stable)', category: 'workflow' },
  { name: 'Production LLM', category: 'ai' }
];

/**
 * Map integration type strings to CSS class names
 * @param {string} type - Integration type
 * @returns {string} CSS class name
 */
function getTypeClass(type) {
  const typeMap = {
    'api': 'api',
    'rest': 'api',
    'graphql': 'api',
    'webhook': 'webhook',
    'email': 'email',
    'scraping': 'scraping',
    'web scraping': 'scraping',
    'voice': 'voice',
    'oauth': 'oauth',
    'oauth2': 'oauth',
    'database': 'database',
    'db': 'database',
    'sdk': 'sdk',
    'file': 'file',
    'sftp': 'file',
    's3': 'file'
  };
  return typeMap[type?.toLowerCase()] || 'standard';
}

/**
 * Map impact levels to CSS class names
 * @param {string} impact - Impact level (high, medium, low)
 * @returns {string} CSS class name
 */
function getImpactClass(impact) {
  const impactMap = {
    'high': 'complex',
    'medium': 'moderate',
    'low': 'standard',
    'critical': 'high_risk'
  };
  return impactMap[impact?.toLowerCase()] || 'moderate';
}

/**
 * Determine technology categories based on integrations and project type
 * @param {object} intake - Intake data
 * @param {object[]} integrations - Integration research results
 * @returns {object[]} Technology stack items
 */
function buildTechnologyStack(intake, integrations) {
  const stack = [...DEFAULT_TECHNOLOGY_STACK];
  const addedCategories = new Set(['workflow', 'ai']);

  // Check project classification for additional tech
  const projectType = intake.classification?.project_type;

  if (projectType === 'voice_agent' && !addedCategories.has('voice')) {
    stack.push({ name: 'Voice AI', category: 'voice' });
    addedCategories.add('voice');
  }

  if (projectType === 'data_pipeline' && !addedCategories.has('database')) {
    stack.push({ name: 'Supabase', category: 'database' });
    addedCategories.add('database');
  }

  if (projectType === 'scraping' && !addedCategories.has('scraping')) {
    stack.push({ name: 'Puppeteer', category: 'scraping' });
    addedCategories.add('scraping');
  }

  // Build searchable content from intake for keyword detection
  const intakeText = JSON.stringify(intake).toLowerCase();
  
  // Detect OCR requirements (fax extraction, document parsing)
  if (!addedCategories.has('ocr') && 
    (intakeText.includes('ocr') || intakeText.includes('fax') || 
      intakeText.includes('extract') && intakeText.includes('document'))) {
    stack.push({ name: 'OCR/Document AI', category: 'ai' });
    addedCategories.add('ocr');
  }
  
  // Detect SMS requirements
  if (!addedCategories.has('sms') && 
    (intakeText.includes('sms') || intakeText.includes('text message') ||
      intakeText.includes('two-way') && intakeText.includes('text'))) {
    stack.push({ name: 'SMS Gateway', category: 'communication' });
    addedCategories.add('sms');
  }

  // Add tech based on detected integrations
  for (const integration of integrations) {
    const systemName = (integration.system || integration.name || '').toLowerCase();
    const {research} = integration;
    
    // Detect telephony/voice integrations
    if (!addedCategories.has('telephony') &&
      (systemName.includes('ringcentral') || systemName.includes('twilio') ||
        systemName.includes('vonage') || systemName.includes('phone'))) {
      stack.push({ name: 'Telephony API', category: 'communication' });
      addedCategories.add('telephony');
      // RingCentral/Twilio also provide SMS - add SMS Gateway if not already present
      if (!addedCategories.has('sms')) {
        stack.push({ name: 'SMS Gateway', category: 'communication' });
        addedCategories.add('sms');
      }
    }
    
    // Detect payment integrations
    if (!addedCategories.has('payments') &&
      (systemName.includes('square') || systemName.includes('stripe') ||
        systemName.includes('payment') || systemName.includes('billing'))) {
      stack.push({ name: 'Payment Processing', category: 'integration' });
      addedCategories.add('payments');
    }

    if (!research) continue;

    const authType = research.auth_type || research.integrations?.[0]?.auth_type;
    if (authType?.toLowerCase().includes('oauth') && !addedCategories.has('oauth')) {
      stack.push({ name: 'OAuth 2.0', category: 'integration' });
      addedCategories.add('oauth');
    }

    // Check if has native n8n node
    const hasNative = research.integrations?.some(i => i.has_native_node);
    if (!hasNative && !addedCategories.has('http')) {
      stack.push({ name: 'HTTP Request', category: 'integration' });
      addedCategories.add('http');
    }
  }

  return stack;
}

/**
 * Truncate text at sentence boundary with ellipsis
 * Falls back to word boundary if no sentence boundary found
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function smartTruncate(text, maxLength = 200) {
  if (!text || text.length <= maxLength) return text;

  // Try to find the last complete sentence within maxLength
  // Sentence boundaries: ., !, ? followed by space or end of string
  const truncated = text.slice(0, Math.max(0, maxLength));
  
  // Look for sentence-ending punctuation followed by space (indicating end of sentence)
  // Search from end backwards to find the last complete sentence
  const sentenceEnders = /[.!?]\s/g;
  let lastSentenceEnd = -1;
  let match;
  
  while ((match = sentenceEnders.exec(truncated)) !== null) {
    // Include the punctuation, not the trailing space
    lastSentenceEnd = match.index + 1;
  }
  
  // Also check for sentence ending at the exact maxLength boundary
  if (truncated.endsWith('.') || truncated.endsWith('!') || truncated.endsWith('?')) {
    lastSentenceEnd = maxLength;
  }
  
  // Use sentence boundary if found in reasonable range (at least 40% of maxLength)
  if (lastSentenceEnd > maxLength * 0.4) {
    return text.slice(0, Math.max(0, lastSentenceEnd));
  }

  // Fallback: Find the last space before maxLength for word boundary
  const lastSpace = truncated.lastIndexOf(' ');

  // If we found a space in reasonable range, cut there
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, Math.max(0, lastSpace)) + '...';
  }
  
  return truncated + '...';
}

/**
 * Find matching integration detail by name
 * @param {string} systemName - System name to match
 * @param {object} integrationDetails - Dictionary of integration details
 * @returns {object|null} Matching detail or null
 */
function findIntegrationDetail(systemName, integrationDetails) {
  if (!integrationDetails) return null;

  const normalizedName = systemName.toLowerCase().replaceAll(/\s+/g, '-');

  // Direct match
  if (integrationDetails[normalizedName]) {
    return integrationDetails[normalizedName];
  }

  // Partial match
  for (const [key, detail] of Object.entries(integrationDetails)) {
    if (key.includes(normalizedName) || normalizedName.includes(key)) {
      return detail;
    }

    // Match by first word
    if (key.split('-')[0] === normalizedName.split('-')[0]) {
      return detail;
    }
  }

  return null;
}

/**
 * Generic category names that should be filtered when specific systems exist
 * Also used for specificity warnings - generic names get flagged for discovery
 */
const GENERIC_CATEGORIES = {
  'phone': ['ringcentral', 'twilio', 'vonage', 'aircall', 'weave', 'podium'],
  'phone/sms': ['ringcentral', 'twilio', 'vonage', 'aircall', 'weave', 'podium'],
  'phone system': ['ringcentral', 'twilio', 'vonage', 'aircall', '3cx', 'asterisk', 'weave', 'podium'],
  'voip': ['ringcentral', 'twilio', 'vonage', 'aircall', '3cx', 'asterisk', 'weave'],
  'pbx': ['ringcentral', 'twilio', 'vonage', 'aircall', '3cx', 'asterisk'],
  'voip-pbx': ['ringcentral', 'twilio', 'vonage', 'aircall', '3cx', 'asterisk', 'weave'],
  'sms': ['twilio', 'ringcentral', 'messagebird', 'weave', 'podium'],
  'email': ['gmail', 'outlook', 'sendgrid', 'mailchimp', 'mailgun'],
  'payments': ['square', 'stripe', 'paypal', 'braintree', 'rectangle health'],
  'payment processing': ['square', 'stripe', 'paypal', 'braintree', 'rectangle health'],
  'web forms': ['jotform', 'typeform', 'google forms', 'formstack'],
  'forms': ['jotform', 'typeform', 'google forms', 'formstack'],
  'crm': ['salesforce', 'hubspot', 'pipedrive', 'zoho', 'monday', 'close'],
  'database': ['supabase', 'postgres', 'mysql', 'mongodb', 'airtable'],
  'storage': ['google drive', 'dropbox', 'box', 's3', 'onedrive'],
  'calendar': ['google calendar', 'outlook calendar', 'calendly'],
  'chat': ['slack', 'microsoft teams', 'discord'],
  'accounting': ['quickbooks', 'xero', 'freshbooks', 'sage', 'netsuite'],
  // Healthcare-specific: EHR is generic, specific systems should take precedence
  'ehr': ['athenahealth', 'epic', 'cerner', 'allscripts', 'meditech', 'drchrono', 'practice fusion', 'nextgen'],
  'ehr/api': ['athenahealth', 'epic', 'cerner', 'allscripts', 'meditech', 'drchrono', 'practice fusion', 'nextgen'],
  'emr': ['athenahealth', 'epic', 'cerner', 'allscripts', 'meditech', 'drchrono', 'practice fusion', 'nextgen'],
  'emr/api': ['athenahealth', 'epic', 'cerner', 'allscripts', 'meditech', 'drchrono', 'practice fusion', 'nextgen'],
  'electronic health records': ['athenahealth', 'epic', 'cerner', 'allscripts'],
  // Dental-specific practice management systems
  'practice management': ['dentrix', 'eaglesoft', 'open dental', 'curve dental', 'clio', 'practicepanther'],
  'dental software': ['dentrix', 'eaglesoft', 'open dental', 'curve dental', '3shape', 'carestream'],
  'pms': ['dentrix', 'eaglesoft', 'open dental', 'curve dental', 'opera', 'cloudbeds'],
  // Document management systems
  'dms': ['netdocuments', 'imanage', 'sharepoint', 'box', 'dropbox'],
  'document management': ['netdocuments', 'imanage', 'sharepoint', 'box', 'dropbox'],
  // Shipping and logistics
  'shipping': ['shipstation', 'fedex', 'ups', 'usps', 'dhl', 'easypost'],
  'logistics': ['shipstation', 'project44', 'samsara', 'keeptruckin'],
  // Support and helpdesk
  'support': ['zendesk', 'freshdesk', 'intercom', 'helpscout', 'servicenow'],
  'helpdesk': ['zendesk', 'freshdesk', 'jira service desk', 'servicenow'],
  'ticketing': ['zendesk', 'freshdesk', 'jira', 'asana', 'monday'],
  // E-commerce platforms
  'e-commerce': ['shopify', 'woocommerce', 'bigcommerce', 'magento', 'squarespace'],
  'ecommerce': ['shopify', 'woocommerce', 'bigcommerce', 'magento', 'squarespace'],
  'online store': ['shopify', 'woocommerce', 'bigcommerce', 'squarespace'],
  // Marketplaces
  'marketplace': ['amazon', 'ebay', 'etsy', 'walmart', 'target plus'],
  // Property management
  'property management': ['appfolio', 'buildium', 'rent manager', 'yardi'],
  // Point of sale
  'pos': ['square', 'toast', 'clover', 'lightspeed', 'shopify pos'],
  'point of sale': ['square', 'toast', 'clover', 'lightspeed'],
  // Additional generic categories
  'api': [], // Always generic unless specific service named
  'webhook': [], // Always generic
  'fax': ['efax', 'hellofax', 'srfax', 'phaxio', 'ringcentral fax'],
  'scheduling': ['calendly', 'acuity', 'cal.com', 'doodle'],
  'referrals': [], // Always needs discovery
  'insurance': ['availity', 'change healthcare', 'waystar', 'trizetto'],
  'insurance verification': ['availity', 'change healthcare', 'waystar', 'trizetto', 'pverify'],
  // Imaging and CAD/CAM (dental/medical)
  'imaging': ['dexis', 'carestream', 'patterson', 'sirona'],
  'cad/cam': ['3shape', 'cerec', 'exocad', 'dental wings']
};

/**
 * Human-readable warnings for generic integration categories
 */
const GENERIC_WARNINGS = {
  'phone': 'Phone system not specified - discovery required to determine API availability',
  'phone system': 'Phone system not specified - discovery required to determine API availability',
  'voip': 'VoIP provider not specified - API capabilities vary widely by provider',
  'pbx': 'PBX system not specified - many on-premise PBX systems have limited or no API',
  'voip-pbx': 'Phone/VoIP system not specified - discovery required to determine integration approach',
  'crm': 'CRM system not specified - integration complexity varies significantly by platform',
  'ehr': 'EHR system not specified - healthcare integrations require HIPAA compliance verification',
  'emr': 'EMR system not specified - healthcare integrations require compliance verification',
  'fax': 'Fax service not specified - may require OCR processing for data extraction',
  'scheduling': 'Scheduling tool not specified - calendar API capabilities vary by provider',
  'referrals': 'Referral source not specified - likely requires manual workflow or custom intake',
  'insurance': 'Insurance verification system not specified - integration approach TBD',
  'insurance verification': 'Insurance verification provider not specified - clearinghouse integration TBD',
  'api': 'Generic API reference - specific service and documentation required',
  'webhook': 'Webhook source not specified - endpoint structure TBD during discovery',
  'forms': 'Form provider not specified - submission webhook/API capabilities TBD',
  'email': 'Email provider not specified - IMAP/OAuth requirements vary by service'
};

/**
 * Check if a system name is a known specific for a generic category
 * @param {string} systemName - The system name to check
 * @param {string} genericKey - The generic category key to check against
 * @returns {boolean} True if systemName is a known specific for this category
 */
function isKnownSpecificFor(systemName, genericKey) {
  const knownSpecifics = GENERIC_CATEGORIES[genericKey] || [];
  const nameLower = systemName.toLowerCase();

  return knownSpecifics.some(specific => {
    const specificLower = specific.toLowerCase();
    return nameLower.includes(specificLower) || specificLower.includes(nameLower);
  });
}

/**
 * Check if a system name matches any generic category using flexible matching
 * Handles variations like "Phone System" matching "phone", "VoIP/PBX" matching "voip-pbx"
 *
 * IMPORTANT: Does NOT flag a system as generic if:
 * 1. The system is a known specific for the matched category (e.g., "Google Calendar" is a known specific for "calendar")
 * 2. The system name has qualifying words beyond the generic term (prefix/suffix indicating a specific product)
 *
 * @param {string} systemName - The system name to check
 * @returns {{isGeneric: boolean, matchedKey: string|null}} Match result
 */
function matchGenericCategory(systemName) {
  const nameLower = systemName.toLowerCase();

  // Normalize: replace slashes with hyphens and spaces, remove extra spaces
  const nameNormalized = nameLower
    .replaceAll('/', ' ')
    .replaceAll('-', ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

  const nameWords = nameNormalized.split(' ');

  // Check each generic category key
  for (const key of Object.keys(GENERIC_CATEGORIES)) {
    const keyNormalized = key
      .replaceAll('/', ' ')
      .replaceAll('-', ' ')
      .replaceAll(/\s+/g, ' ')
      .trim();

    const keyWords = keyNormalized.split(' ');
    let isMatch = false;

    // Exact match after normalization
    if (nameNormalized === keyNormalized) {
      isMatch = true;
    }
    // Check if key is contained in name (e.g., "phone" in "phone system")
    else if (nameWords.includes(keyNormalized) || nameNormalized.includes(keyNormalized)) {
      isMatch = true;
    }
    // Check if any word in the name matches any word in the key
    else {
      for (const nameWord of nameWords) {
        for (const keyWord of keyWords) {
          if (nameWord === keyWord && nameWord.length > 2) { // Skip very short matches
            isMatch = true;
            break;
          }
        }

        if (isMatch) break;
      }
    }

    if (isMatch) {
      // CRITICAL FIX: Check if this is actually a known specific product for this category
      // e.g., "Google Calendar" should NOT be flagged as generic "calendar"
      // e.g., "Rectangle Health" should NOT be flagged due to "health" in "electronic health records"
      if (isKnownSpecificFor(systemName, key)) {
        continue; // Skip - this is a known specific, not a generic placeholder
      }

      // Check if the system name has brand-like characteristics that override generic detection
      // e.g., "Rectangle Health" should NOT be flagged as generic "electronic health records"
      // because "Rectangle" is a brand name (capitalized, not a generic descriptor)
      const originalWords = systemName.split(/\s+/);
      const firstWord = originalWords[0];
      
      // Normalize firstWord for comparison (Phone/SMS -> phone, sms)
      const firstWordNormalized = firstWord.toLowerCase().replaceAll(/[/\-]/g, ' ').trim();
      const firstWordParts = firstWordNormalized.split(' ').filter(p => p.length > 0);

      // Generic modifiers that don't indicate a brand
      const genericModifiers = new Set(['my', 'our', 'the', 'a', 'an', 'generic', 'custom', 'internal', 'legacy']);

      // Generic descriptors that are commonly capitalized but still indicate generic systems
      // These should NOT be treated as brand names
      // NOTE: Include both singular and plural forms for common terms
      const genericDescriptors = new Set([
        'payment', 'payments', 'phone', 'phones', 'email', 'emails', 'health', 'calendar', 'calendars',
        'scheduling', 'crm', 'erp', 'accounting', 'inventory', 'shipping', 'billing', 'invoicing',
        'booking', 'bookings', 'reservation', 'reservations', 'appointment', 'appointments',
        'messaging', 'communication', 'communications', 'document', 'documents',
        'file', 'files', 'storage', 'database', 'databases', 'server', 'servers',
        'system', 'systems', 'platform', 'platforms', 'portal', 'portals',
        'management', 'tracking', 'reporting', 'analytics', 'marketing', 'sales',
        'support', 'service', 'services', 'customer', 'customers', 'client', 'clients',
        'vendor', 'vendors', 'supplier', 'suppliers', 'employee', 'employees',
        'hr', 'payroll', 'time', 'project', 'projects', 'task', 'tasks',
        'workflow', 'workflows', 'automation', 'integration', 'integrations',
        'api', 'apis', 'gateway', 'gateways', 'processor', 'processors',
        'provider', 'providers', 'solution', 'solutions', 'claims', 'imaging', 'personal',
        'sms', 'voip', 'pbx', 'ehr', 'emr'
      ]);

      // Check if first word looks like a brand name (capitalized + not generic)
      // This applies regardless of word count - "Rectangle Health" (2) vs "electronic health records" (3)
      // Use firstWordParts to handle compound terms like "Phone/SMS" -> ["phone", "sms"]
      const hasGenericPart = firstWordParts.some(part => 
        genericModifiers.has(part) || genericDescriptors.has(part)
      );
      
      if (firstWord && firstWord[0] === firstWord[0].toUpperCase() && !hasGenericPart) {
        // First word is capitalized and not a generic modifier/descriptor - likely a brand name
        continue;
      }

      return { isGeneric: true, matchedKey: key };
    }
  }

  return { isGeneric: false, matchedKey: null };
}

/**
 * Build integrations array for template from research data
 * @param {object[]} integrationResearch - Array of integration research results
 * @param {object} intake - Intake data (for fallback notes)
 * @returns {object[]} Integrations array for template
 */
function buildIntegrations(integrationResearch, _intake) {
  const integrations = [];

  // First pass: categorize all systems as generic or specific
  const genericEntries = new Map(); // genericKey -> integration item
  const specificEntries = [];       // Non-generic integration items

  for (const item of integrationResearch) {
    // IMPORTANT: Pass original casing to matchGenericCategory for brand detection
    // The function will normalize internally for matching, but needs original case
    // to detect brand names like "Rectangle Health" vs generic "health"
    const originalName = item.system || item.integration || '';
    const genericMatch = matchGenericCategory(originalName);

    if (genericMatch.isGeneric) {
      // This is a generic category placeholder
      if (!genericEntries.has(genericMatch.matchedKey)) {
        genericEntries.set(genericMatch.matchedKey, item);
      }
    } else {
      // This is a specific system (real product name)
      specificEntries.push(item);
    }
  }

  // Second pass: for each generic category, check if ANY specific system might belong to it
  // A specific entry "belongs" to a generic category if:
  // 1. It matches one of the known specifics for that category, OR
  // 2. There's a context hint (the generic exists AND a non-generic specific exists - assume they're related)
  const filteredResearch = [];

  // Add all specific entries
  for (const item of specificEntries) {
    filteredResearch.push(item);
  }

  // For each generic category, decide if it should be included
  for (const [genericKey, genericItem] of genericEntries.entries()) {
    const knownSpecifics = GENERIC_CATEGORIES[genericKey] || [];

    // Check 1: Is there a known specific system?
    const hasKnownSpecific = knownSpecifics.some(s =>
      specificEntries.some(item => {
        const itemName = (item.system || item.integration || '').toLowerCase();
        // Match if specific name is in category list or vice-versa
        return itemName.includes(s) || s.includes(itemName) || 
        // Also check for category name itself in the specific item (e.g. "Twilio SMS" matches "SMS")
          itemName.includes(genericKey);
      })
    );

    if (hasKnownSpecific) {
      // Skip this generic - we have a known specific for this category
      continue;
    }

    // Check 2: Intelligent category inference
    // If we have a generic like "CRM" and a specific like "Cleo" that isn't in our known list,
    // try to determine if Cleo is likely a CRM by checking if it co-occurs with the generic
    // Heuristic: If there's BOTH a generic "CRM" AND a non-generic entry in the same intake,
    // the non-generic is likely the specific instance the client meant

    // Category-based filtering: certain generics should be removed if ANY non-listed specific exists
    const categoriesRequiringOnlyKnown = ['crm', 'database', 'ehr', 'emr', 'phone', 'phone system', 'voip', 'pbx'];

    if (categoriesRequiringOnlyKnown.includes(genericKey)) {
      // For these critical categories, if there are ANY specific entries in the intake,
      // we should investigate if they might be instances of this generic category

      // Simple heuristic: if the original intake data explicitly mentions both the generic
      // AND something else, the "something else" is probably the specific
      // E.g., intake has ["CRM", "Cleo"] - Cleo is probably the CRM

      // Count how many specific entries exist that aren't in ANY known category list
      const unknownSpecifics = specificEntries.filter(item => {
        const itemName = (item.system || item.integration || '').toLowerCase();
        // Check if this specific is in ANY known category list
        for (const specificsList of Object.values(GENERIC_CATEGORIES)) {
          if (specificsList.some(s => itemName.includes(s) || s.includes(itemName))) {
            return false; // It's a known specific for some category
          }
        }

        return true; // It's an unknown specific
      });

      // If there are unknown specifics AND this is a key category, likely one of them IS this category
      // Apply conservative logic: only filter if there's 1 unknown specific (high confidence it's the match)
      if (unknownSpecifics.length === 1 && specificEntries.length > 0) {
        // Strong signal: exactly one unknown specific suggests it's the specific instance of this generic
        continue;
      }

      // If we have many specifics and a generic, the generic is likely redundant noise
      if (specificEntries.length >= 2 && unknownSpecifics.length > 0) {
        // Multiple specifics suggest the intake is well-defined; generic is noise
        continue;
      }
    }

    // Include this generic - no specific found that would make it redundant
    filteredResearch.push(genericItem);
  }

  for (const item of filteredResearch) {
    const {research} = item;
    const systemName = item.system || item.integration;

    // Determine complexity from research or default
    let complexity = 'standard';
    let type = 'api';
    let hasNativeNode = false;
    let notes = '';

    if (research?.found === true) {
      // Use research data directly from flat structure
      // Research object contains: has_native_n8n_node, auth_type, complexity, research_notes, etc.
      hasNativeNode = research.has_native_n8n_node || research.has_native_node || false;
      type = research.auth_type?.toLowerCase().includes('oauth') ? 'oauth' : 'api';

      // Set complexity from research
      if (research.complexity_tier) {
        complexity = research.complexity_tier.toLowerCase();
      } else if (research.complexity?.tier) {
        complexity = research.complexity.tier.toLowerCase();
      } else if (!hasNativeNode) {
        complexity = 'moderate';
      }

      // Build notes from research data
      // Priority: research_notes > effort_recommendation.rationale > gotchas
      // Use smartTruncate for word-boundary truncation (250 chars for better readability)
      if (research.research_notes) {
        notes = smartTruncate(research.research_notes, 500);
      } else if (research.effort_recommendation?.rationale) {
        notes = smartTruncate(research.effort_recommendation.rationale, 500);
      } else if (research.gotchas?.length > 0) {
        notes = smartTruncate(research.gotchas[0], 500);
      }

      // Add auth type prefix if we have notes
      if (notes && research.auth_type) {
        const authShort = research.auth_type.split('/')[0].trim();
        if (authShort.length < 20) {
          notes = `${authShort}. ${notes}`;
        }
      }

      // Fallback: if still no notes but we have auth info
      if (!notes && research.auth_type) {
        notes = `Auth: ${smartTruncate(research.auth_type, 120)}`;
      }
    } else if (research?.integrations?.length > 0) {
      // Legacy structure with nested integrations array (backwards compatibility)
      const integrationData = research.integrations.find(
        i => i.name?.toLowerCase().includes(systemName.toLowerCase()) ||
          systemName.toLowerCase().includes(i.name?.toLowerCase() || '')
      ) || research.integrations[0];

      hasNativeNode = integrationData.has_native_node;
      type = integrationData.auth_type?.toLowerCase().includes('oauth') ? 'oauth' : 'api';

      if (research.complexity?.tier) {
        complexity = research.complexity.tier.toLowerCase();
      } else if (!hasNativeNode) {
        complexity = 'moderate';
      }

      // Build notes from legacy structure
      if (research.effort_recommendation?.rationale) {
        notes = smartTruncate(research.effort_recommendation.rationale, 500);
      }

      if (integrationData.auth_type && !notes) {
        notes = `Auth: ${smartTruncate(integrationData.auth_type, 250)}`;
      }
    } else {
      // No research found - provide professional fallback note
      // Debug suggestion is kept in schema.research_gap_report, NOT in client output
      notes = 'Custom HTTP integration required';
    }

    // Check if scraping integration
    const systemLower = systemName.toLowerCase();
    if (systemLower.includes('scraping') || systemLower.includes('website') || systemLower.includes('web scraper')) {
      type = 'scraping';
      complexity = 'complex';
    }

    // Determine complexity score for Page 8 internal display
    let complexityScore = null;
    let complexityTier = null;
    let devLevel = 'Mid Level';
    
    // Extract complexity score from research if available
    const detail = research?.integration_details ? 
      findIntegrationDetail(systemName, research.integration_details) : null;
    
    if (detail?.complexity_score) {
      complexityScore = detail.complexity_score;
      complexityTier = detail.complexity_tier;
    } else if (research?.complexity?.score) {
      complexityScore = research.complexity.score;
      complexityTier = research.complexity.tier;
    }
    
    // Assign developer level based on complexity
    if (complexityScore !== null) {
      if (complexityScore <= 3) devLevel = 'Jr Dev';
      else if (complexityScore <= 6) devLevel = 'Mid Level';
      else if (complexityScore <= 8) devLevel = 'Sr Dev';
      else devLevel = 'Sr Architect';
    }

    // SPECIFICITY CHECK: Determine if this is a generic category name (using flexible matching)
    const genericMatch = matchGenericCategory(systemName);
    const {isGeneric} = genericMatch;
    const specificityWarning = isGeneric 
      ? (GENERIC_WARNINGS[genericMatch.matchedKey] || GENERIC_WARNINGS[systemLower] || 'Specific system not identified - discovery required') 
      : null;

    integrations.push({
      system_name: systemName,
      type,
      type_class: getTypeClass(type),
      complexity,
      has_native_node: hasNativeNode,
      notes: notes || 'Standard integration pattern',
      // SPECIFICITY FLAGS for warning display
      is_generic: isGeneric,
      specificity_warning: specificityWarning,
      // Page 8 Internal fields (not displayed to client)
      complexity_internal: {
        score: complexityScore,
        tier: complexityTier,
        dev_level: devLevel,
        display: complexityScore ? `${complexityScore}/10` : null
      }
    });
  }

  return integrations;
}

/**
 * Build labor factors from research data
 * @param {object[]} integrationResearch - Integration research results
 * @returns {object[]} Labor factors array for template
 */
function buildLaborFactors(integrationResearch) {
  const factors = [];
  const seenFactors = new Set();

  for (const item of integrationResearch) {
    const {research} = item;
    if (!research?.labor_factors) continue;

    for (const laborFactor of research.labor_factors) {
      // Deduplicate
      if (seenFactors.has(laborFactor.factor)) continue;
      seenFactors.add(laborFactor.factor);

      factors.push({
        factor: laborFactor.factor,
        impact: laborFactor.impact?.charAt(0).toUpperCase() + laborFactor.impact?.slice(1) || 'Medium',
        impact_class: getImpactClass(laborFactor.impact),
        notes: laborFactor.notes || ''
      });
    }
  }

  return factors;
}

/**
 * Fallback API documentation URLs for common integrations
 * Used when research data has no citations
 */
const FALLBACK_CITATIONS = {
  'jotform': { url: 'https://api.jotform.com/docs/', description: 'Jotform: API Documentation' },
  'twilio': { url: 'https://www.twilio.com/docs/usage/api', description: 'Twilio: API Documentation' },
  'slack': { url: 'https://api.slack.com/docs', description: 'Slack: API Documentation' },
  'hubspot': { url: 'https://developers.hubspot.com/docs/api/overview', description: 'HubSpot: API Documentation' },
  'salesforce': { url: 'https://developer.salesforce.com/docs/apis', description: 'Salesforce: API Documentation' },
  'stripe': { url: 'https://stripe.com/docs/api', description: 'Stripe: API Documentation' },
  'airtable': { url: 'https://airtable.com/developers/web/api/introduction', description: 'Airtable: API Documentation' },
  'notion': { url: 'https://developers.notion.com/reference/intro', description: 'Notion: API Documentation' },
  'zapier': { url: 'https://platform.zapier.com/reference', description: 'Zapier: Platform Documentation' },
  'google sheets': { url: 'https://developers.google.com/sheets/api', description: 'Google Sheets: API Documentation' },
  'monday': { url: 'https://developer.monday.com/api-reference/docs', description: 'Monday.com: API Documentation' }
};

/**
 * Build citations array from research data
 * @param {object[]} integrationResearch - Integration research results
 * @returns {object[]} Citations array for template
 */
function buildCitations(integrationResearch) {
  const citations = [];
  const seenUrls = new Set();
  const integrationsWithCitations = new Set();
  let index = 1;

  for (const item of integrationResearch) {
    const {research} = item;
    if (!research?.citations) continue;

    for (const citation of research.citations) {
      if (seenUrls.has(citation.url)) continue;
      seenUrls.add(citation.url);

      // Extract integration name from URL hostname for accurate labeling
      let integrationLabel = '';
      let urlPath = '';

      try {
        const urlObj = new URL(citation.url);
        const hostname = urlObj.hostname.replace('www.', '');
        urlPath = urlObj.pathname.split('/').filter(Boolean).slice(0, 2).join('/');

        // Derive integration name from hostname
        if (hostname.includes('ringcentral')) {
          integrationLabel = 'RingCentral';
        } else if (hostname.includes('pipedrive')) {
          integrationLabel = 'PipeDrive';
        } else if (hostname.includes('google') || hostname.includes('gmail')) {
          integrationLabel = 'Google/Gmail';
        } else if (hostname.includes('athena')) {
          integrationLabel = 'Athenahealth';
        } else if (hostname.includes('square')) {
          integrationLabel = 'Square';
        } else if (hostname.includes('twilio')) {
          integrationLabel = 'Twilio';
        } else if (hostname.includes('jotform')) {
          integrationLabel = 'Jotform';
        } else if (hostname.includes('n8n')) {
          integrationLabel = 'n8n Docs';
        } else if (hostname.includes('github')) {
          integrationLabel = 'GitHub';
        } else {
          // Use first part of hostname
          integrationLabel = hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
        }
      } catch {
        // Fallback to item's integration name
        integrationLabel = item.system || item.integration || 'Reference';
        urlPath = '';
      }

      // Build description from URL path or citation description
      const pathDescription = citation.description || urlPath || 'Documentation';

      citations.push({
        index: index++,
        url: citation.url,
        description: `${integrationLabel}: ${pathDescription}`
      });

      // Track that this integration has citations
      integrationsWithCitations.add(integrationLabel.toLowerCase());
    }
  }

  // Add fallback citations for integrations without any citations
  for (const item of integrationResearch) {
    const integrationName = (item.system || item.integration || '').toLowerCase();
    
    // Skip if this integration already has citations
    if (integrationsWithCitations.has(integrationName)) continue;
    
    // Check for fallback citation
    const fallback = FALLBACK_CITATIONS[integrationName];
    if (fallback && !seenUrls.has(fallback.url)) {
      seenUrls.add(fallback.url);
      citations.push({
        index: index++,
        url: fallback.url,
        description: fallback.description
      });
      integrationsWithCitations.add(integrationName);
    }
  }

  return citations;
}

/**
 * Feature extraction keywords mapping
 * Maps keywords found in intake to standardized feature names
 */
const FEATURE_KEYWORDS = {
  // Scheduling features
  'scheduling': 'appointment scheduling',
  'appointment': 'appointment scheduling',
  'booking': 'appointment scheduling',
  'calendar': 'appointment scheduling',

  // Communication features
  'sms': 'sms reminders',
  'twilio': 'sms reminders',
  'text message': 'sms reminders',
  'reminder': 'sms reminders',
  'notification': 'sms reminders',

  // CRM features
  'crm': 'crm sync',
  'salesforce': 'crm sync',
  'hubspot': 'crm sync',
  'pipedrive': 'crm sync',

  // Lead management
  'lead': 'lead qualification',
  'qualify': 'lead qualification',
  'qualification': 'lead qualification',
  'prospect': 'lead qualification',

  // Payment features
  'payment': 'payment processing',
  'billing': 'payment processing',
  'invoice': 'payment processing',
  'stripe': 'payment processing',
  'square': 'payment processing',

  // Voice features
  'voicemail': 'voicemail transcription',
  'transcription': 'voicemail transcription',
  'voice message': 'voicemail transcription',

  // After-hours features
  'after-hours': 'after-hours handling',
  'after hours': 'after-hours handling',
  '24/7': 'after-hours handling',
  'overnight': 'after-hours handling',

  // Support features
  'support': 'customer support',
  'help desk': 'customer support',
  'ticket': 'customer support',

  // Follow-up features
  'follow-up': 'follow-up sequences',
  'follow up': 'follow-up sequences',
  'outreach': 'follow-up sequences',

  // Data features
  'sync': 'data sync',
  'integration': 'data sync',
  'transfer': 'data sync',

  // Insurance features
  'insurance': 'insurance verification',
  'verification': 'insurance verification',
  'eligibility': 'insurance verification',

  // Dispatch features
  'dispatch': 'technician dispatch',
  'technician': 'technician dispatch',
  'service call': 'technician dispatch',

  // Triage features
  'triage': 'emergency triage',
  'emergency': 'emergency triage',
  'urgent': 'emergency triage',
};

/**
 * Extract features from intake data
 * @param {object} intake - Intake data
 * @param {object[]} integrations - Integration list
 * @returns {string[]} Array of feature names
 */
function extractFeatures(intake, integrations) {
  const features = new Set();

  // Build searchable text from intake
  const searchText = [
    intake.section_a_workflow_definition?.q01_workflow_name || '',
    intake.section_a_workflow_definition?.q02_trigger_event || '',
    intake.section_a_workflow_definition?.q03_business_objective || '',
    intake.section_a_workflow_definition?.q04_end_condition || '',
    JSON.stringify(intake.section_c_systems_handoffs || {}),
  ].join(' ').toLowerCase();

  // Extract features from keywords
  for (const [keyword, feature] of Object.entries(FEATURE_KEYWORDS)) {
    if (searchText.includes(keyword.toLowerCase())) {
      features.add(feature);
    }
  }

  // Extract from integration names
  const integrationNames = integrations.map(i =>
    (i.system_name || i.name || '').toLowerCase()
  ).join(' ');

  for (const [keyword, feature] of Object.entries(FEATURE_KEYWORDS)) {
    if (integrationNames.includes(keyword.toLowerCase())) {
      features.add(feature);
    }
  }

  // Project type specific features
  const projectType = intake.classification?.project_type;
  if (projectType === 'voice_agent') {
    features.add('voice automation');
  }

  // If very few features detected, add some based on project type
  if (features.size < 2) {
    if (projectType === 'voice_agent') {
      features.add('call handling');
    }

    if (searchText.includes('dental') || searchText.includes('clinic') || searchText.includes('medical')) {
      features.add('appointment scheduling');
    }

    if (searchText.includes('sales') || searchText.includes('marketing')) {
      features.add('lead qualification');
    }
  }

  return [...features];
}

/**
 * Generate summary text based on project type and integrations
 * @param {object} intake - Intake data
 * @param {number} integrationCount - Number of integrations
 * @returns {string} Summary text
 */
function generateSummary(intake, integrationCount) {
  const projectType = intake.classification?.project_type || 'workflow_automation';

  const typeDescriptions = {
    'workflow_automation': 'workflow automation',
    'ai_agent': 'AI agent development and LLM integration',
    'integration': 'system integration',
    'voice_agent': 'voice AI agent implementation',
    'data_pipeline': 'data pipeline and ETL processing',
    'scraping': 'data extraction and web scraping',
    'mixed': 'hybrid automation'
  };

  const desc = typeDescriptions[projectType] || 'automation';
  const plural = integrationCount > 1 ? `${integrationCount} systems` : '1 system';

  return `Hybrid solution combining ${desc}, AI processing, and ${plural} integration. Built on n8n workflow engine with production-grade LLM capabilities.`;
}

/**
 * Build the technical_approach object for the template
 * @param {object} intake - Extracted intake data
 * @param {object[]} integrationResearch - Integration research results from researchAllIntegrations
 * @param {Map<string, object>} [systemIntelligence] - Optional unified intelligence map for enrichment
 * @returns {object} Technical approach object for template
 */
export function buildTechnicalApproach(intake, integrationResearch = [], systemIntelligence = null) {
  // Filter to integrations that were actually found
  let validResearch = integrationResearch.filter(r => r && r.integration);

  // Enrich with system intelligence if available
  if (systemIntelligence && systemIntelligence.size > 0) {
    validResearch = validResearch.map(item => {
      const systemName = (item.system || item.integration || '').toLowerCase().trim();
      const intel = systemIntelligence.get(systemName);

      if (intel) {
        // Merge intelligence into research item
        return {
          ...item,
          research: {
            ...item.research,
            // Prefer intelligence data when available
            complexity: item.research?.complexity || {
              score: intel.complexity_score || 5,
              tier: intel.complexity_tier || 'moderate',
              factors: [],
              estimated_nodes: 10
            },
            integrations: (item.research?.integrations || []).map(i => ({
              ...i,
              has_native_node: intel.has_native_node || i.has_native_node,
              native_node_name: intel.native_node_name || i.native_node_name
            })),
            // Add intelligence-specific fields
            _intel_source: intel.source,
            _intel_gotchas: intel.gotchas,
            _intel_auth_type: intel.auth_type,
            _intel_rate_limits: intel.rate_limits
          }
        };
      }

      return item;
    });
  }

  // Build citations FIRST to get index mapping
  const citations = buildCitations(validResearch);
  
  // Create integration name → citation index map
  const citationIndexMap = new Map();
  for (const citation of citations) {
    // Extract integration name from citation description (format: "IntegrationName: path")
    const integrationName = citation.description.split(':')[0].trim().toLowerCase();
    if (!citationIndexMap.has(integrationName)) {
      citationIndexMap.set(integrationName, citation.index);
    }
  }

  // Build components
  const technologyStack = buildTechnologyStack(intake, validResearch);
  const rawIntegrations = buildIntegrations(validResearch, intake);
  
  // Add citation_index to each integration
  const integrations = rawIntegrations.map(integration => {
    const systemLower = integration.system_name.toLowerCase();
    // Try exact match first, then partial match
    let citationIndex = citationIndexMap.get(systemLower);
    if (!citationIndex) {
      // Try partial match
      for (const [name, index] of citationIndexMap.entries()) {
        if (systemLower.includes(name) || name.includes(systemLower)) {
          citationIndex = index;
          break;
        }
      }
    }

    return {
      ...integration,
      citation_index: citationIndex || null
    };
  });
  
  const laborFactors = buildLaborFactors(validResearch);
  const summary = generateSummary(intake, integrations.length);

  // Extract features from intake and integrations
  const features = extractFeatures(intake, integrations);

  // SPECIFICITY SUMMARY: Count generic vs specific integrations
  const genericIntegrations = integrations.filter(i => i.is_generic);
  const specificIntegrations = integrations.filter(i => !i.is_generic);
  const hasGenericIntegrations = genericIntegrations.length > 0;
  const genericNames = genericIntegrations.map(i => i.system_name);

  return {
    summary,
    technology_stack: technologyStack,
    integrations,
    features, // Features extracted from intake for evaluation comparison
    labor_factors: laborFactors,
    citations,
    // SPECIFICITY STATS for template conditionals and warning blocks
    specificity: {
      has_generic: hasGenericIntegrations,
      generic_count: genericIntegrations.length,
      specific_count: specificIntegrations.length,
      total_count: integrations.length,
      generic_list: genericNames,
      // Pre-computed display string for Mustache (avoids invalid {{^last}} syntax)
      generic_list_display: genericNames.join(', '),
      discovery_required: hasGenericIntegrations
    }
  };
}

export default buildTechnicalApproach;
