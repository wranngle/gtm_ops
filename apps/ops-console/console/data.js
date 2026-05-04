/* ============================================================
   Data fixtures — gtm_ops console
   Single global object: window.GTM
   ============================================================ */

window.GTM = (function () {

  /* ---------- Companies / Leads ---------- */
  const companies = [
    { id:'helix', name:'Helix Robotics', industry:'Industrial Automation', size:'180', region:'Boston, MA',
      stage:'qualifying', score:84, owner:'agent-01', icp:0.91, intent:'high',
      pain:'Manual lead handoff between SDRs — 28% drop-off at qualification',
      url:'helixrobotics.io', techStack:['Salesforce','Outreach','Gong'],
      lastTouch:'2h ago', nextStep:'Discovery call — Thu 14:00', nextStepWhen:'in 2d',
      arr:'$420K', dealSize:'$48K', closeProb:0.46 },
    { id:'lattice', name:'Lattice Optics', industry:'Photonics / R&D', size:'62', region:'Eindhoven, NL',
      stage:'discovery', score:78, owner:'agent-01', icp:0.83, intent:'med',
      pain:'Quoting cycle takes 11 days — losing to fast competitors',
      url:'lattice-optics.eu', techStack:['HubSpot','Slack','Notion'],
      lastTouch:'4h ago', nextStep:'Stakeholder map review', nextStepWhen:'tomorrow',
      arr:'$110K', dealSize:'$22K', closeProb:0.38 },
    { id:'banyan', name:'Banyan Health', industry:'Healthtech', size:'420', region:'Austin, TX',
      stage:'proposal', score:91, owner:'agent-02', icp:0.94, intent:'high',
      pain:'5 disconnected billing systems — manual recon eats 6 FTEs',
      url:'banyan.health', techStack:['Salesforce','Looker','Snowflake','Workday'],
      lastTouch:'45m ago', nextStep:'Procurement intro — Sec & Compliance', nextStepWhen:'today',
      arr:'$2.1M', dealSize:'$280K', closeProb:0.62 },
    { id:'thornfield', name:'Thornfield Foods', industry:'CPG / Food Mfg', size:'1.2K', region:'Chicago, IL',
      stage:'closed', score:88, owner:'agent-02', icp:0.79, intent:'high',
      pain:'COGS visibility lag — 14d to know margin movement',
      url:'thornfield.co', techStack:['SAP','Power BI'],
      lastTouch:'yesterday', nextStep:'Kickoff handoff to CS', nextStepWhen:'Mon 09:00',
      arr:'$880K', dealSize:'$165K', closeProb:1 },
    { id:'mosaic', name:'Mosaic Wealth', industry:'Wealth Mgmt', size:'95', region:'Denver, CO',
      stage:'discovery', score:71, owner:'agent-01', icp:0.72, intent:'med',
      pain:'Advisor reporting is screenshot-driven; compliance flags risk',
      url:'mosaicwealth.com', techStack:['Salesforce FSC','Tableau'],
      lastTouch:'1d ago', nextStep:'Tech deep-dive', nextStepWhen:'Fri',
      arr:'$220K', dealSize:'$36K', closeProb:0.31 },
    { id:'ironclad', name:'Ironclad Cement', industry:'Building Materials', size:'3.4K', region:'São Paulo, BR',
      stage:'qualifying', score:64, owner:'agent-03', icp:0.66, intent:'low',
      pain:'Plant downtime data trapped in 12 SCADA silos',
      url:'ironcladcement.com.br', techStack:['Oracle','Aveva'],
      lastTouch:'3d ago', nextStep:'Identify champion in Ops', nextStepWhen:'next week',
      arr:'$5.2M', dealSize:'$420K', closeProb:0.18 },
    { id:'verdant', name:'Verdant Logistics', industry:'3PL / Supply Chain', size:'820', region:'Rotterdam, NL',
      stage:'proposal', score:86, owner:'agent-02', icp:0.88, intent:'high',
      pain:'Carrier rate negotiation — no historical leverage data',
      url:'verdantlog.eu', techStack:['Manhattan','Coupa','Slack'],
      lastTouch:'6h ago', nextStep:'Pricing committee review', nextStepWhen:'Wed',
      arr:'$640K', dealSize:'$120K', closeProb:0.55 },
    { id:'kestrel', name:'Kestrel Bio', industry:'Biotech / CRO', size:'140', region:'Cambridge, UK',
      stage:'qualifying', score:74, owner:'agent-01', icp:0.81, intent:'med',
      pain:'IND submission docs assembled by hand — 6 weeks per filing',
      url:'kestrelbio.uk', techStack:['Veeva','Benchling','Box'],
      lastTouch:'1h ago', nextStep:'Technical fit call', nextStepWhen:'today 16:00',
      arr:'$310K', dealSize:'$74K', closeProb:0.42 },
    { id:'sablefin', name:'Sablefin Capital', industry:'Hedge Fund', size:'48', region:'New York, NY',
      stage:'lost', score:58, owner:'agent-03', icp:0.55, intent:'low',
      pain:'Trade reconciliation — 90min daily by ops desk',
      url:'sablefin.io', techStack:['Bloomberg','Excel','Eze'],
      lastTouch:'1w ago', nextStep:'Re-engage Q2', nextStepWhen:'paused',
      arr:'$95K', dealSize:'$18K', closeProb:0 },
    { id:'borealis', name:'Borealis Mining', industry:'Mining / Exploration', size:'2.1K', region:'Calgary, AB',
      stage:'discovery', score:69, owner:'agent-03', icp:0.72, intent:'med',
      pain:'ESG reporting consolidation — 9 country reports + audit prep',
      url:'borealismining.ca', techStack:['SAP','Workiva'],
      lastTouch:'2d ago', nextStep:'Procurement workflow demo', nextStepWhen:'Mon',
      arr:'$1.4M', dealSize:'$210K', closeProb:0.34 },
    { id:'fernwood', name:'Fernwood Schools', industry:'EdTech / K-12', size:'220', region:'Toronto, ON',
      stage:'qualifying', score:72, owner:'agent-01', icp:0.77, intent:'med',
      pain:'Parent comms across 14 buildings — 38 separate spreadsheets',
      url:'fernwood.ed', techStack:['PowerSchool','Brightspace'],
      lastTouch:'8h ago', nextStep:'IT security questionnaire', nextStepWhen:'Thu',
      arr:'$180K', dealSize:'$28K', closeProb:0.39 },
    { id:'arcadia', name:'Arcadia Insurance', industry:'P&C Insurance', size:'1.8K', region:'Hartford, CT',
      stage:'proposal', score:82, owner:'agent-02', icp:0.85, intent:'high',
      pain:'Claims triage cycle — 4.2 day median, target 1.5',
      url:'arcadia-ins.com', techStack:['Guidewire','Salesforce','Snowflake'],
      lastTouch:'30m ago', nextStep:'Legal redlines on MSA', nextStepWhen:'tomorrow',
      arr:'$3.8M', dealSize:'$520K', closeProb:0.58 },
  ];

  const stages = [
    { id:'qualifying', label:'Qualifying', accent:'sunset' },
    { id:'discovery',  label:'Discovery',  accent:'violet' },
    { id:'proposal',   label:'Proposal',   accent:'sunset' },
    { id:'closed',     label:'Closed Won', accent:'healthy' },
    { id:'lost',       label:'Lost',       accent:'neutral' },
  ];

  /* ---------- Calls / Transcripts ---------- */
  const calls = [
    { id:'CALL-2419', co:'Banyan Health', co_id:'banyan', who:'Priya Mendel · VP Operations',
      duration:'34:12', when:'45m ago', outcome:'meeting-booked',
      score:8.7, sentiment:0.72, talkRatio:0.34, deflections:0, flags:1 },
    { id:'CALL-2418', co:'Helix Robotics', co_id:'helix', who:'Marcus Trent · Director RevOps',
      duration:'18:44', when:'2h ago', outcome:'qualified',
      score:7.9, sentiment:0.58, talkRatio:0.42, deflections:1, flags:0 },
    { id:'CALL-2417', co:'Arcadia Insurance', co_id:'arcadia', who:'Dana Wu · CIO',
      duration:'42:30', when:'30m ago', outcome:'pricing-objection',
      score:6.4, sentiment:-0.12, talkRatio:0.51, deflections:3, flags:2 },
    { id:'CALL-2416', co:'Verdant Logistics', co_id:'verdant', who:'Joost Bakker · Head of Procurement',
      duration:'29:08', when:'6h ago', outcome:'follow-up',
      score:7.2, sentiment:0.31, talkRatio:0.39, deflections:1, flags:0 },
    { id:'CALL-2415', co:'Kestrel Bio', co_id:'kestrel', who:'Dr. Anjali Shah · Head of Regulatory',
      duration:'21:14', when:'1h ago', outcome:'technical-deep-dive',
      score:8.1, sentiment:0.61, talkRatio:0.36, deflections:0, flags:0 },
    { id:'CALL-2414', co:'Lattice Optics', co_id:'lattice', who:'Pieter de Vries · COO',
      duration:'15:42', when:'4h ago', outcome:'discovery',
      score:6.8, sentiment:0.22, talkRatio:0.48, deflections:2, flags:1 },
    { id:'CALL-2413', co:'Sablefin Capital', co_id:'sablefin', who:'Eli Korn · COO',
      duration:'08:20', when:'1w ago', outcome:'no-fit',
      score:3.2, sentiment:-0.41, talkRatio:0.62, deflections:5, flags:3 },
  ];

  /* Transcript for the active call (Banyan) */
  const transcriptBanyan = [
    { t:'00:00', who:'agent', txt:'Priya, thanks for jumping on. Before we get into anything, I want to make sure I have the right picture — last quarter you mentioned five billing systems and a recon team of six. Still accurate?' },
    { t:'00:14', who:'caller', txt:"Mostly. We retired one on the legacy clinic side, so it's four now, but we added a new pediatric joint venture that brought its own. So effectively, yes, five." },
    { t:'00:29', who:'agent', txt:"Got it — net flat. And the recon team — same six, or has that shifted?" },
    { t:'00:36', who:'caller', txt:"Six full-time, plus we pull two from FP&A every month-end. It's the month-end pull that's killing us, honestly. We close five days late every cycle." },
    { t:'00:58', who:'tool', txt:'[crm.note] flag: month-end FP&A pull = quantifiable hidden cost. Logged to discovery.banyan.pain[3].' },
    { t:'01:02', who:'agent', txt:"That's the part I want to dig into. The five-day close — what does that actually cost you? Is leadership feeling it, or is it more an ops grumble?" },
    { t:'01:14', who:'caller', txt:"Both, but the CFO put it in the board deck last quarter. We have a covenant on our credit facility tied to monthly reporting timeliness. Two more late closes and we re-price." },
    { t:'01:38', who:'agent', txt:"So this is a covenant risk, not a process annoyance. That changes the framing. Have you put a dollar number on a re-pricing event?", flag:true },
    { t:'01:52', who:'caller', txt:"Internal estimate is forty to sixty basis points on a $90M facility. So call it three-to-five hundred K annual." },
    { t:'02:18', who:'agent', txt:"Understood. I want to be useful here, so let me ask the harder question — if we shipped you a unified ledger view in 60 days, what would have to be true for you to choose us over building it on Snowflake with your data team?" },
    { t:'02:42', who:'caller', txt:"Time-to-value, mostly. My data team is queued out four quarters. And honestly, our last in-house build took 14 months and we still hit the same wall." },
    { t:'03:01', who:'tool', txt:'[crm.signal] competitive_threat: in-house build → unlikely. Build vs buy lean: BUY (high confidence).' },
    { t:'03:05', who:'agent', txt:"Okay. Two follow-ups for you, then I'll let you go. First, can you intro me to whoever owns the credit facility relationship? That's the budget signal. Second — your procurement process. Is there a security review I should start in parallel?" },
    { t:'03:31', who:'caller', txt:"Yes on both. Treasury sits with our CFO Marcus — I'll put him on a thread today. And our SecOps lead is Reena, I'll loop her in too. We have a SIG-Lite as the standard." },
    { t:'03:55', who:'agent', txt:"Perfect. I'll send a recap with three things: covenant-risk framing, proposed 60-day pilot scope, and the security questionnaire link. Anything else you want me to address explicitly when Marcus reads the email cold?" },
    { t:'04:18', who:'caller', txt:"Pricing. He's a numbers-first guy. Ballpark is fine but he'll dismiss anything without one." },
    { t:'04:25', who:'agent', txt:"Understood. I'll put a banded number with assumptions. Talk soon.", flag:true },
  ];

  const callScores = [
    { axis:'Pain Discovery',     score:9.2, weight:25, detail:'Quantified covenant risk to $300–500K/yr' },
    { axis:'Stakeholder Mapping',score:8.6, weight:20, detail:'CFO + SecOps introductions secured' },
    { axis:'Build vs Buy',       score:9.0, weight:15, detail:'Surfaced & defused in-house build threat' },
    { axis:'Talk Ratio',         score:8.4, weight:10, detail:'34% rep / 66% prospect (target ≤40%)' },
    { axis:'Next-Step Clarity',  score:9.1, weight:15, detail:'3 specific deliverables + named owners' },
    { axis:'Pricing Disclosure', score:6.8, weight:10, detail:'Deferred — flag risk: cold-read by CFO' },
    { axis:'Compliance Hygiene', score:8.0, weight: 5, detail:'PHI mention handled within policy' },
  ];

  /* ---------- Evals ---------- */
  const evalSuites = [
    { id:'discovery-q1', name:'Discovery — Pain Quantification', runs:1842, pass:0.872,
      latest:'21m ago', delta:+0.041, owner:'agent-01' },
    { id:'objection-pricing', name:'Objection — Pricing Pushback', runs:944, pass:0.794,
      latest:'1h ago', delta:-0.018, owner:'agent-02' },
    { id:'multithread', name:'Multi-thread Stakeholder Map', runs:712, pass:0.681,
      latest:'2h ago', delta:+0.092, owner:'agent-01' },
    { id:'compliance-phi', name:'Compliance — PHI Handling', runs:2104, pass:0.991,
      latest:'10m ago', delta:0, owner:'agent-02' },
    { id:'closing-mutual', name:'Closing — Mutual Action Plan', runs:608, pass:0.722,
      latest:'4h ago', delta:+0.011, owner:'agent-03' },
    { id:'recap-quality', name:'Recap Email — Recall Accuracy', runs:1480, pass:0.913,
      latest:'30m ago', delta:+0.027, owner:'agent-01' },
  ];

  /* ---------- Proposals ---------- */
  const proposals = [
    { id:'PR-2041', co:'Banyan Health', amount:'$280K', stage:'redlines',
      sent:'2d ago', viewed:'17 times', sections:7, accepted:5,
      blockers:['Liability cap','Auto-renewal'], owner:'agent-02' },
    { id:'PR-2040', co:'Verdant Logistics', amount:'$120K', stage:'review',
      sent:'4d ago', viewed:'9 times', sections:6, accepted:6,
      blockers:[], owner:'agent-02' },
    { id:'PR-2039', co:'Arcadia Insurance', amount:'$520K', stage:'legal',
      sent:'1w ago', viewed:'31 times', sections:8, accepted:4,
      blockers:['Indemnification scope','Data residency','SLA credits'], owner:'agent-02' },
    { id:'PR-2038', co:'Thornfield Foods', amount:'$165K', stage:'signed',
      sent:'2w ago', viewed:'14 times', sections:7, accepted:7,
      blockers:[], owner:'agent-02' },
  ];

  /* ---------- Activity / console feed ---------- */
  const feed = [
    { t:'14:41:08', level:'info', txt:'discovery.banyan: meeting booked → procurement intro (Marcus, CFO)' },
    { t:'14:39:52', level:'ok',   txt:'eval.compliance-phi: 992/1000 PASS · run #2104' },
    { t:'14:38:11', level:'info', txt:'crm.helix: lead score 78 → 84 (intent surge: G2 page view ×3)' },
    { t:'14:36:44', level:'warn', txt:'agent-03 paused: arcadia call — pricing objection unresolved (3 deflections)' },
    { t:'14:35:02', level:'info', txt:'proposal.verdant: section 6/6 accepted — green to send' },
    { t:'14:33:29', level:'err',  txt:'webhook.salesforce: 502 retrying (3/5) — sablefin.contact.update' },
    { t:'14:32:51', level:'info', txt:'agent-01 → outreach: kestrel sequence step 2 dispatched (94 recipients)' },
    { t:'14:31:14', level:'ok',   txt:'crm.thornfield: closed-won $165K — handoff to CS (owner: K. Park)' },
    { t:'14:29:33', level:'info', txt:'eval.objection-pricing: regression -1.8% on enterprise tier' },
    { t:'14:27:18', level:'warn', txt:'icp.borealis: stale (3d) — auto-flagged for re-qualification' },
  ];

  /* ---------- Stats ---------- */
  const stats = {
    pipeline:'$8.42M',
    pipelineDelta:+12.4,
    activeAgents:3,
    callsToday:47,
    callsTodayDelta:+8,
    qualifiedThisWeek:23,
    qualifiedThisWeekDelta:+5,
    avgScore:7.6,
    avgScoreDelta:+0.3,
    evalPassRate:0.847,
    evalPassRateDelta:+0.024,
  };

  /* ---------- Sparkline data (12 points each) ---------- */
  const sparks = {
    pipeline:[42,48,46,52,55,58,62,60,68,71,76,84],
    calls:[3,5,4,7,6,8,11,9,10,12,8,11],
    score:[6.8,7.0,7.2,7.1,7.3,7.4,7.2,7.5,7.3,7.6,7.7,7.6],
    evalPass:[.78,.79,.80,.79,.81,.82,.83,.82,.84,.83,.85,.847],
  };

  /* ---------- Agents ---------- */
  const agents = [
    { id:'agent-01', name:'Hunter', role:'Outbound + Discovery', status:'active',
      currentTask:'Drafting recap → kestrelbio',
      runtime:'4d 12h', tasks:284, success:0.892 },
    { id:'agent-02', name:'Closer', role:'Proposal + Negotiation', status:'active',
      currentTask:'Awaiting redlines · banyan',
      runtime:'4d 12h', tasks:147, success:0.871 },
    { id:'agent-03', name:'Watcher', role:'Pipeline Hygiene + Re-engage', status:'paused',
      currentTask:'Paused — awaiting human review (arcadia)',
      runtime:'4d 12h', tasks:312, success:0.764 },
  ];

  return {
    companies, stages, calls, transcriptBanyan, callScores,
    evalSuites, proposals, feed, stats, sparks, agents,
  };
})();
