/* ============================================================
   Local ElevenLabs UI surface
   ------------------------------------------------------------
   The upstream ElevenLabs UI registry is shadcn/Tailwind-first. This console
   is a static React UMD app, so these components mirror the library's
   primitives (Orb, Conversation, Message, Response, Transcript Viewer,
   Voice Button, Bar Visualizer) in repo-native CSS/React.
   ============================================================ */

function ELOrb({ state = 'idle', size = 44, color1, color2, label = 'ElevenLabs agent state' }) {
  return (
    <span
      className={`el-orb el-orb--${state}`}
      aria-label={label}
      role="img"
      style={{
        width: size,
        height: size,
        '--orb-c1': color1 || 'var(--sunset-500)',
        '--orb-c2': color2 || 'var(--violet-500)',
      }}
    >
      <span className="el-orb__ring"/>
      <span className="el-orb__core"/>
    </span>
  );
}

function ELBarVisualizer({ bars = [], active = false, tone = 'accent' }) {
  const fallback = [0.25, 0.52, 0.35, 0.78, 0.46, 0.63, 0.31, 0.58, 0.42, 0.74, 0.28, 0.5];
  const values = bars.length ? bars : fallback;
  return (
    <div className={`el-bars el-bars--${tone} ${active ? 'is-active' : ''}`} aria-hidden="true">
      {values.slice(0, 18).map((v, i) => (
        <span key={i} style={{ height: `${Math.max(10, Math.min(100, v * 100))}%`, animationDelay: `${i * 48}ms` }}/>
      ))}
    </div>
  );
}

function ELVoiceButton({ active, disabled, onClick, children }) {
  return (
    <button
      className={`el-voice-btn ${active ? 'is-active' : ''}`}
      type="button"
      disabled={disabled}
      aria-pressed={Boolean(active)}
      onClick={onClick}
    >
      <ELOrb state={active ? 'talking' : 'idle'} size={24}/>
      <span>{children || (active ? 'Stop replay' : 'Replay voice turn')}</span>
    </button>
  );
}

function ELMessage({ role, children, meta }) {
  const from = role === 'caller' || role === 'user' ? 'user' : role === 'tool_response' || role === 'tool' ? 'tool' : 'assistant';
  return (
    <div className={`el-message el-message--${from}`}>
      <div className="el-message__bubble">
        {meta && <div className="el-message__meta">{meta}</div>}
        <div className="el-response">{children}</div>
      </div>
    </div>
  );
}

function ELConversation({ messages = [], emptyTitle = 'No transcript available', emptySub = 'Select a run with transcript output.' }) {
  return (
    <div className="el-conversation" role="log" tabIndex={0} aria-label="Evaluation conversation transcript">
      {messages.length === 0 ? (
        <div className="el-conversation__empty">
          <ELOrb size={42} state="idle"/>
          <div>
            <div className="el-conversation__empty-title">{emptyTitle}</div>
            <div className="el-conversation__empty-sub">{emptySub}</div>
          </div>
        </div>
      ) : messages.map((m, i) => (
        <ELMessage key={`${m.role || 'turn'}-${m.turn || i}`} role={m.role} meta={m.tool_call ? `tool: ${m.tool_call.name}` : (m.turn ? `turn ${m.turn}` : undefined)}>
          {m.tool_call ? JSON.stringify(m.tool_call.arguments || {}) : (m.text || m.detail || m.result || '')}
        </ELMessage>
      ))}
    </div>
  );
}

function ELTranscriptViewer({ run, detail, replaying, onReplay }) {
  const transcript = (detail && (detail.transcript_summary || detail.transcript || detail.messages)) || [];
  const axes = run?.score?.axes || [];
  const generated = transcript.length ? transcript : axes.map((axis, i) => ({
    turn: i + 1,
    role: axis.pass ? 'agent' : 'caller',
    text: `${axis.name}: ${axis.detail}`,
  }));
  return (
    <div className="el-transcript">
      <div className="el-transcript__toolbar">
        <ELVoiceButton active={replaying} onClick={onReplay}>
          {replaying ? 'Stop voice replay' : 'Replay evaluated path'}
        </ELVoiceButton>
        <ELBarVisualizer active={replaying} tone={run?.verdict === 'fail' ? 'critical' : 'healthy'}/>
      </div>
      <ELConversation messages={generated}/>
    </div>
  );
}

Object.assign(globalThis, {
  ElevenUI: {
    Orb: ELOrb,
    BarVisualizer: ELBarVisualizer,
    VoiceButton: ELVoiceButton,
    Message: ELMessage,
    Conversation: ELConversation,
    TranscriptViewer: ELTranscriptViewer,
  },
});
