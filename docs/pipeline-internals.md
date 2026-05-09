# Architecture Documentation

> Technical architecture for unified_presales_report

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED PRESALES PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │   CLI    │    │  Server  │    │  Library │    │   Web    │              │
│  │  cli.ts  │───▶│ server.ts│───▶│ index.js │    │ public/  │              │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘              │
│        │              │                                │                     │
│        └──────────────┴───────────────┬───────────────┘                     │
│                                       │                                      │
│                              ┌────────▼────────┐                            │
│                              │   UnifiedPipeline│                            │
│                              │   lib/pipeline.ts│                            │
│                              └────────┬────────┘                            │
│                                       │                                      │
│     ┌─────────────────────────────────┼─────────────────────────────────┐   │
│     │                                 │                                  │   │
│     ▼                                 ▼                                  ▼   │
│  ┌──────────┐                  ┌──────────────┐                  ┌──────────┐│
│  │ Extract  │                  │   Research   │                  │ Estimate ││
│  │extract.js│                  │integration_  │                  │estimate. ││
│  └──────────┘                  │research.js   │                  │js        ││
│                                │proactive_    │                  └──────────┘│
│                                │research.js   │                              │
│                                └──────────────┘                              │
│                                       │                                      │
│     ┌─────────────────────────────────┼─────────────────────────────────┐   │
│     │                                 │                                  │   │
│     ▼                                 ▼                                  ▼   │
│  ┌──────────┐                  ┌──────────────┐                  ┌──────────┐│
│  │Transform │                  │    Render    │                  │  Output  ││
│  │template_ │                  │presales_     │                  │html, pdf,││
│  │context.js│                  │report.html   │                  │json      ││
│  └──────────┘                  └──────────────┘                  └──────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Entry Layer

```
cli.ts ──────► Parses args, validates input, connects to server
                     │
server.ts ◄──────────┘ Express API + SSE streaming
     │
     └──► /api/generate   POST - Start pipeline
     └──► /api/stream     GET  - SSE log events
     └──► /api/history    GET  - Execution history
     └──► /api/sample     GET  - Generate sample input
```

### 2. Pipeline Core

```
UnifiedPipeline (lib/pipeline.ts)
├── Stage 1: validate_input
├── Stage 2: extract_structure
│   └── Extractor.extractIntakeData()
├── Stage 3: research_integrations
│   ├── researchAllIntegrations()
│   ├── performProactiveResearch()
│   └── quickTierAssessment()
├── Stage 4: estimate_effort
│   └── generateEstimate()
├── Stage 5: build_proposal
│   ├── buildProjectPlanContext()
│   └── buildProposalContext()
├── Stage 6: render_html
│   └── Mustache.render()
├── Stage 7: polish_narratives
│   └── htmlPolish()
└── Stage 8: generate_pdf
    └── generatePDF()
```

### 3. Research System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESEARCH ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input: section_c_systems_handoffs.q10_systems_involved                      │
│         ["CRM (HubSpot)", "Phone (RingCentral)", "Calendar"]                 │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    integration-research.js                            │   │
│  │                                                                       │   │
│  │  1. loadLibraryIndex()                                                │   │
│  │     └── n8n_workflow_development/context/technical-research/          │   │
│  │         └── library-index.json                                        │   │
│  │                                                                       │   │
│  │  2. parseResearchMarkdown(content)                                    │   │
│  │     ├── Extract: title, confidence, executive_summary                 │   │
│  │     ├── Parse: integrations table, integration_details                │   │
│  │     ├── Extract: complexity score, labor_factors, risks               │   │
│  │     └── Collect: citations (URLs)                                     │   │
│  │                                                                       │   │
│  │  3. calculateFreshness(date)                                          │   │
│  │     ├── < 30 days: Fresh (score 0.7-1.0)                              │   │
│  │     ├── 30-90 days: Stale (score 0.5)                                 │   │
│  │     └── > 90 days: Very stale (score 0.2)                             │   │
│  │                                                                       │   │
│  │  4. generateResearchGapReport()                                       │   │
│  │     ├── Categorize: fresh, stale, missing                             │   │
│  │     └── Generate: actionable_commands for missing research            │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                     │                                        │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    proactive-research.js                              │   │
│  │                                                                       │   │
│  │  N8N_NATIVE_NODES (embedded database):                                │   │
│  │  ┌───────────────────────────────────────────────────────────────┐   │   │
│  │  │ hubspot:     { node: 'n8n-nodes-base.hubspot', auth: 'oauth2',│   │   │
│  │  │               quality: 'excellent', complexity: 3 }            │   │   │
│  │  │ ringcentral: { node: 'n8n-nodes-base.ringcentral',            │   │   │
│  │  │               auth: 'oauth2', quality: 'good', complexity: 4 } │   │   │
│  │  │ ... (60+ integrations)                                         │   │   │
│  │  └───────────────────────────────────────────────────────────────┘   │   │
│  │                                                                       │   │
│  │  CATEGORY_MAPPINGS:                                                   │   │
│  │  ┌───────────────────────────────────────────────────────────────┐   │   │
│  │  │ crm:    ['hubspot', 'salesforce', 'pipedrive', 'zoho']        │   │   │
│  │  │ phone:  ['twilio', 'vonage', 'ringcentral']                   │   │   │
│  │  │ email:  ['gmail', 'outlook', 'sendgrid']                      │   │   │
│  │  └───────────────────────────────────────────────────────────────┘   │   │
│  │                                                                       │   │
│  │  researchIntegrationWithLLM(name):                                    │   │
│  │  1. lookupNativeNode() - Check database                               │   │
│  │  2. If found: Return database info (zero-latency)                     │   │
│  │  3. If not: LLM research with structured prompt                       │   │
│  │  4. saveResearchToLibrary() - Cache for future                        │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Intake Schema

```typescript
interface IntakeData {
  prepared_for: {
    account_name: string;
    contact_name: string;
    contact_title: string;
  };
  section_a_workflow_definition: {
    q01_workflow_name: string;
    q02_expected_trigger_frequency: string;
    q03_workflow_start_triggers: string[];
  };
  section_b_pain_points: {
    q04_time_sink_activities: Activity[];
    q05_error_prone_steps: string[];
    q06_revenue_impacting_delays: string[];
    q07_compliance_concerns: string[];
    q08_repetitive_decisions: string[];
    q09_satisfaction_issues: string[];
  };
  section_c_systems_handoffs: {
    q10_systems_involved: string[];
    q11_data_flow_touchpoints: string[];
    q12_auth_types: string[];
    q13_data_sensitivity: string;
  };
  // ... additional sections
}
```

### Research Result

```typescript
interface IntegrationResearch {
  integration: string;
  found: boolean;
  from_cache: boolean;
  generated: boolean;
  has_native_n8n_node: boolean;
  native_node_name: string | null;
  auth_type: string;
  api_quality: 'excellent' | 'good' | 'fair' | 'poor';
  complexity: {
    score: number;        // 1-10
    tier: string;         // 'standard' | 'moderate' | 'complex' | 'enterprise'
    estimated_hours: number;
  };
  effort_recommendation: {
    tier: string;
    base_hours: number;
    rationale: string;
  };
  gotchas: string[];
  client_must_provide: string[];
  citations: { id: number; url: string; type: string }[];
  freshness: {
    stale: boolean;
    days: number;
    score: number;
    reason: string;
  };
}
```

### Estimate Schema

```typescript
interface EstimateOutput {
  tier_assessment: TierAssessment;
  bleed: BleedCalculation;
  pricing: PricingBreakdown;
  finops: FinOpsAnalysis;
  milestones: MilestoneCard[];
  roi: ROICalculation;
}
```

---

## External Dependencies

### LLM Services

```
┌──────────────────────┐     ┌──────────────────────┐
│   Google Gemini      │     │        Groq          │
│   (Primary LLM)      │     │   (Fallback LLM)     │
│                      │     │                      │
│  - gemini-2.0-flash  │     │  - llama-3.3-70b     │
│  - gemini-2.5-pro    │     │                      │
└──────────────────────┘     └──────────────────────┘
         │                           │
         └───────────┬───────────────┘
                     │
              ┌──────▼──────┐
              │ src/services│
              │   /llm.ts   │
              └─────────────┘
```

### n8n Methodology Integration

```
unified_presales_report/          n8n_workflow_development/
        │                                  │
        │  reads from                      │
        └──────────────────────────────────┤
                                           │
                    context/technical-research/
                    ├── library-index.json
                    ├── hubspot-crm-integration.md
                    ├── ringcentral-voip.md
                    └── ...
```

---

## Security Considerations

1. **API Key Storage** - Keys in `.env`, never committed
2. **Input Validation** - LLM outputs validated before calculations
3. **SQLite Injection** - Parameterized queries in history.js
4. **File Access** - Input/output directories controlled

---

## Performance Characteristics

| Operation | Latency | Notes |
|-----------|---------|-------|
| Database node lookup | <1ms | Embedded N8N_NATIVE_NODES |
| Cached research load | ~10ms | JSON parse from filesystem |
| LLM research generation | 2-5s | Per integration |
| Full pipeline execution | 30-90s | Depends on LLM calls |
| PDF generation | 5-10s | Puppeteer rendering |

---

## Deployment Architecture

```
Production (Local)
├── Node.js 18+ (ESM)
├── SQLite (config databases)
├── Puppeteer + Chromium (PDF)
└── File system (output artifacts)

Web Dashboard
├── Express.js server
├── SSE for real-time logs
└── Static HTML/CSS/JS
```

---

*Architecture documentation generated by BMad Method*
