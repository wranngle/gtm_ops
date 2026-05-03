/**
 * Research Tools Adapter
 *
 * Direct API implementations for "Real" research tools:
 * - Exa (Neural Search)
 * - Tavily (AI Search)
 *
 * Used by proactive_research.js when API keys are available.
 */

import https from 'https';

// =============================================================================
// TYPES
// =============================================================================

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
};

type SearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type ExaSearchResult = {
  source: 'exa';
  results: SearchResult[];
};

export type TavilySearchResult = {
  source: 'tavily';
  answer: string;
  results: SearchResult[];
};

export type ResearchFindings = {
  sources: Array<ExaSearchResult | TavilySearchResult>;
  context: string;
};

type Environment = {
  EXA_API_KEY?: string;
  TAVILY_API_KEY?: string;
  [key: string]: string | undefined;
};

// =============================================================================
// NATIVE HTTP REQUEST
// =============================================================================

/**
 * Execute a fetch-like request using native https module
 * (Avoids dependency on 'node-fetch' or global fetch if older node)
 */
async function nativeRequest(url: string, options: RequestOptions = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      port: 443
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => { reject(e); });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// =============================================================================
// EXA SEARCH
// =============================================================================

/**
 * Search Exa (formerly Metaphor)
 */
export async function searchExa(query: string, apiKey: string): Promise<ExaSearchResult | null> {
  if (!apiKey) throw new Error('Exa API key missing');

  console.log(`[ResearchTools] 🧠 Exa Neural Search: "${query}"`);

  try {
    const result = await nativeRequest('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: {
        query,
        numResults: 5,
        useAutoprompt: true, // Let Exa optimize the query
        contents: {
          text: true
        }
      }
    });

    return {
      source: 'exa',
      results: result.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.text ? r.text.slice(0, 500) + '...' : '',
        score: r.score
      }))
    };
  } catch (error) {
    console.warn('[ResearchTools] Exa search failed:', (error as Error).message);
    return null;
  }
}

// =============================================================================
// TAVILY SEARCH
// =============================================================================

/**
 * Search Tavily
 */
export async function searchTavily(query: string, apiKey: string): Promise<TavilySearchResult | null> {
  if (!apiKey) throw new Error('Tavily API key missing');

  console.log(`[ResearchTools] 🕵️ Tavily Search: "${query}"`);

  try {
    const result = await nativeRequest('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        api_key: apiKey,
        query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 5
      }
    });

    return {
      source: 'tavily',
      answer: result.answer,
      results: result.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score
      }))
    };
  } catch (error) {
    console.warn('[ResearchTools] Tavily search failed:', (error as Error).message);
    return null;
  }
}

// =============================================================================
// AGGREGATED RESEARCH
// =============================================================================

/**
 * Aggregated Research
 * Tries available tools in order: Exa -> Tavily -> Google Grounding (fallback)
 */
export async function performDeepResearch(
  query: string,
  env: Environment = process.env as Environment
): Promise<ResearchFindings> {
  const findings: ResearchFindings = {
    sources: [],
    context: ''
  };

  // 1. Try Exa
  if (env.EXA_API_KEY) {
    const exaResults = await searchExa(query, env.EXA_API_KEY);
    if (exaResults) {
      findings.sources.push(exaResults);
      findings.context += `\n\n### Exa Research Results\n${exaResults.results.map(r => `- [${r.title}](${r.url}): ${r.content}`).join('\n')}`;
    }
  }

  // 2. Try Tavily
  if (env.TAVILY_API_KEY) {
    const tavilyResults = await searchTavily(query, env.TAVILY_API_KEY);
    if (tavilyResults) {
      findings.sources.push(tavilyResults);
      findings.context += `\n\n### Tavily Research Results\n**AI Answer:** ${tavilyResults.answer}\n\n**Sources:**\n${tavilyResults.results.map(r => `- [${r.title}](${r.url}): ${r.content}`).join('\n')}`;
    }
  }

  return findings;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  searchExa,
  searchTavily,
  performDeepResearch
};
