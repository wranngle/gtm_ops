# gtm_ops

> voice-AI-led GTM motion runtime: presales pipeline + ops UI. one repo, one runnable thing.

[![License](https://img.shields.io/github/license/wranngle/gtm_ops?color=A371F7)](./LICENSE) ![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

> [!NOTE]
> Personal tool. I use this. You can too.

## Quick start

```bash
git clone https://github.com/wranngle/gtm_ops.git
cd gtm_ops
bun install
```

## What it does

The runtime ingests leads, enriches CRM context, and runs a structured LLM extraction to generate branded PDF proposals. Every pipeline step writes audit logs for operator review in the static ops-console. It provides both the backend processing API and the frontend review surface in a single package.

## Usage

Start the live backend server:

```bash
bun run start
```

Or run the fixture-driven UI without a backend:

```bash
cd apps/ops-console
python -m http.server 8000
```

Open `http://localhost:8000` to view the console.

## License

See [LICENSE](./LICENSE).
