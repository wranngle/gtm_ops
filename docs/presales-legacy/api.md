# API Documentation

## POST /api/generate

Generate presales reports from intake data.

### Request Body

```json
{
  "input": "<JSON string or text>",
  "structured": true | false,
  "async": true | false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input` | string | Yes | The intake data (JSON string if structured, raw text otherwise) |
| `structured` | boolean | No | Set to `true` for JSON input, `false` (default) for raw text |
| `async` | boolean | No | Set to `true` for async mode (returns immediately), `false` (default) for sync |

### Structured JSON Input Format

When `structured: true`, the `input` field should contain a JSON string with form field values. Use question IDs as keys:

#### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `client_name` | string | Company/organization name | `"Acme Corp"` |
| `q01_workflow_name` | string | Name of the business process | `"Lead Qualification"` |
| `q02_trigger_event` | string | What starts this process | `"New lead submitted"` |
| `q03_business_objective` | string | Goal of the process | `"Qualify leads quickly"` |
| `q06_runs_per_period` | number | Volume per time period | `50` |
| `q06_period_unit` | string | Time period (`day`, `week`, `month`) | `"day"` |
| `q07_avg_trigger_to_end` | number | Time per item | `15` |
| `q07_time_unit` | string | Time unit (`minutes`, `hours`) | `"minutes"` |
| `q10_systems_involved` | array | List of systems/integrations | `["hubspot", "email"]` |

#### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `contact_name` | string | Primary contact name | `"John Smith"` |
| `contact_title` | string | Contact's job title | `"Operations Manager"` |
| `contact_email` | string | Contact email | `"john@example.com"` |
| `industry` | string | Industry vertical | `"dental"`, `"healthcare"` |
| `q04_end_condition` | string | Success criteria | `"Task completed"` |
| `q05_outcome_owner` | string | Process owner role | `"Front Office Manager"` |
| `q08_worst_case_delay` | number | Worst case delay time | `24` |
| `q08_delay_unit` | string | Delay time unit | `"hours"` |
| `q09_business_hours` | string | Operating hours | `"standard"`, `"extended"` |
| `current_solution` | string | Current approach | `"manual"`, `"voicemail"` |
| `q10_systems_other` | string | Additional systems (free text) | `"Custom portal, fax"` |
| `q11_manual_transfers` | string | Manual data entry description | `"Staff copies data..."` |
| `q12_human_decisions` | string | Required human decisions | `"Manager approval..."` |
| `q13_common_failures` | string | Common failure modes | `"Missed follow-ups..."` |
| `q14_failure_cost` | string | Cost of failures | `"$380,000 annually"` |
| `hourly_rate` | number | Hourly labor cost (USD) | `65` |
| `q15_priority` | string | Primary priority/pain point | `"Reduce response time"` |
| `budget_range` | string | Budget range | `"10k_25k"`, `"25k_50k"` |
| `timeline_weeks` | string | Expected timeline | `"2_3_months"` |
| `decision_maker` | string | Is user a decision maker | `"yes"`, `"no"` |
| `lead_source` | string | How they found you | `"referral"`, `"web"` |
| `urgency` | string | Urgency level | `"high"`, `"medium"`, `"low"` |
| `competitors` | string | Evaluating competitors | `"yes_casual"`, `"no"` |
| `previous_automation` | string | Previous automation attempts | `"yes_failed"`, `"no"` |

### Minimal Example

```json
{
  "input": "{\"client_name\":\"Acme Corp\",\"q01_workflow_name\":\"Lead Qualification\",\"q02_trigger_event\":\"New lead submitted\",\"q03_business_objective\":\"Qualify leads quickly\",\"q06_runs_per_period\":50,\"q06_period_unit\":\"day\",\"q07_avg_trigger_to_end\":15,\"q07_time_unit\":\"minutes\",\"q10_systems_involved\":[\"hubspot\",\"email\"]}",
  "structured": true
}
```

### Full Example (Dental Practice)

```json
{
  "input": "{\"client_name\":\"Bright Smile Dental\",\"contact_name\":\"Dr. Patricia Chen\",\"contact_title\":\"Practice Director\",\"contact_email\":\"pchen@brightsmile.com\",\"industry\":\"dental\",\"q01_workflow_name\":\"Patient Scheduling and Treatment Coordination\",\"q02_trigger_event\":\"New patient calls or submits website request\",\"q03_business_objective\":\"Schedule patients, verify insurance, prepare documentation\",\"q04_end_condition\":\"Appointment confirmed, reminders scheduled, insurance verified\",\"q05_outcome_owner\":\"Front Office Operations Manager\",\"q06_runs_per_period\":200,\"q06_period_unit\":\"day\",\"q07_avg_trigger_to_end\":25,\"q07_time_unit\":\"minutes\",\"q08_worst_case_delay\":24,\"q08_delay_unit\":\"hours\",\"q09_business_hours\":\"extended\",\"current_solution\":\"voicemail\",\"q10_systems_involved\":[\"dentrix\",\"phone_system\",\"email\",\"excel\"],\"q10_systems_other\":\"Custom patient portal, fax machine\",\"q11_manual_transfers\":\"Staff manually copies patient info into Dentrix and billing system\",\"q12_human_decisions\":\"Manager approval for payment plans over $2000\",\"q13_common_failures\":\"Missed follow-ups, double-bookings, incorrect data entry\",\"q14_failure_cost\":\"Revenue lost to no-shows: $380,000 annually\",\"hourly_rate\":75,\"q15_priority\":\"Reduce response time and cut no-show rate\",\"budget_range\":\"25k_50k\",\"timeline_weeks\":\"2_3_months\",\"decision_maker\":\"yes\",\"urgency\":\"high\"}",
  "structured": true
}
```

### Response (Sync Mode)

```json
{
  "success": true,
  "execution_id": 123,
  "artifacts": {
    "html": "/path/to/unified_report.html",
    "pdf": "/path/to/unified_report.pdf",
    "json": "/path/to/unified_schema.json"
  },
  "summary": {
    "client": "acme-corp",
    "total_price": 11500,
    "total_hours": 80,
    "audit_score": 45
  }
}
```

### Response (Async Mode)

```json
{
  "message": "Started"
}
```

In async mode, connect to Server-Sent Events at `/api/generate/stream` to receive progress updates.

### Error Responses

| Status | Description |
|--------|-------------|
| 400 | Invalid input (missing or malformed) |
| 429 | Rate limit exceeded (10 req/hour) |
| 500 | Pipeline failed |

### Rate Limiting

- 10 requests per hour per IP address
- Headers include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Supported Systems

The following systems are recognized for integration research:

| Category | Systems |
|----------|---------|
| CRM | hubspot, salesforce, zoho_crm, pipedrive |
| PMS (Dental) | dentrix, opendental, eaglesoft, denticon |
| Communication | email, gmail, outlook, slack, twilio, sms |
| Calendar | google_calendar, outlook_calendar, calendly |
| Spreadsheet | excel, google_sheets, airtable |
| Phone | phone_system, ringcentral, twilio |
| Other | webhook, api, database, custom |

## n8n Webhook Integration

Two n8n webhooks are available for automated report generation:

### 1. Presales Report Generator (Detailed Intake)

**Webhook URL:** `https://n8n.wranngle.com/webhook/presales-intake`
**Method:** POST
**n8n Workflow:** `[DEV] Presales Report Generator` (ID: `xdzhNykWZSzHgPDC`)

Accepts the full structured intake format (same fields as `/api/generate`). Transforms fields, calls the pipeline API, and delivers reports via email.

**Flow:** Webhook → Transform → `/api/generate` → Email to client + internal notification

```bash
# Test with minimal intake
curl -X POST https://n8n.wranngle.com/webhook/presales-intake \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Corp",
    "contact_email": "test@example.com",
    "q01_workflow_name": "Lead Qualification",
    "q02_trigger_event": "New lead submitted",
    "q03_business_objective": "Qualify leads quickly",
    "q06_runs_per_period": 50,
    "q06_period_unit": "day",
    "q07_avg_trigger_to_end": 15,
    "q07_time_unit": "minutes",
    "q10_systems_involved": ["hubspot", "email"]
  }'
```

**Email Delivery:**
- Client gets PDF + summary (if `contact_email` provided)
- Internal team (`sales@wranngle.com`) gets artifacts link + lead score
- Failures trigger error notification to internal team

### 2. Lead Intake Form (Basic + Auto-Report)

**Webhook URL:** `https://n8n.wranngle.com/webhook/wranngle-intake-form`
**Method:** POST
**n8n Workflow:** `Wranngle Lead Intake` (ID: `SY5XCbzxX32eCIeO`)

Accepts basic lead data from the website form. Sends email + SMS notification to sales team, then auto-generates a presales report using default assumptions.

**Required Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `businessName` | string | Company name |
| `industry` | string | Industry/trade |
| `ownerName` | string | Contact name |
| `phone` | string | Phone number |
| `email` | string | Email address |
| `package` | string | Selected package |

**Optional:** `agentName`, `notes`, `status`

```bash
# Test lead intake
curl -X POST https://n8n.wranngle.com/webhook/wranngle-intake-form \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Plumbing LLC",
    "industry": "plumbing",
    "ownerName": "John Smith",
    "phone": "+15551234567",
    "email": "john@testplumbing.com",
    "package": "starter"
  }'
```

## Sample Files

Sample structured intake files are available in `/input/`:

- `sample_structured_minimal.json` - Minimal required fields
- `sample_structured_dental.json` - Full dental practice example
- `sample_structured_hvac.json` - HVAC service company example
