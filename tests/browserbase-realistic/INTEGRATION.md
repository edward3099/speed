# Browserbase MCP Integration Guide

## Important Note

The test framework is structured, but the actual Browserbase MCP integration needs to be implemented. The Browserbase MCP tools are available in Cursor IDE, but when running tests via `npm run`, you'll need to either:

1. **Use Cursor's MCP directly** (recommended for now)
2. **Create a Node.js MCP client** to call Browserbase MCP tools
3. **Use Browserbase SDK directly** instead of MCP

## Option 1: Direct Browserbase SDK (Recommended)

Instead of using MCP, you can use the Browserbase SDK directly in your tests:

```bash
npm install @browserbasehq/sdk
```

Then update `browserbase-impl.ts` to use the SDK:

```typescript
import { Browserbase } from '@browserbasehq/sdk'

const browserbase = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY!,
  projectId: process.env.BROWSERBASE_PROJECT_ID!,
})
```

## Option 2: MCP Client (Advanced)

Create an MCP client that can call Browserbase MCP tools from Node.js. This requires setting up an MCP server connection.

## Current Status

The framework is ready, but the actual browser control implementation needs to be completed. The structure is in place:

- ✅ Test orchestrator
- ✅ Realistic behavior simulation
- ✅ Test scenarios
- ✅ State verification
- ⚠️ Browserbase integration (needs implementation)

## Next Steps

1. Choose integration method (SDK recommended)
2. Implement browser control in `browserbase-impl.ts`
3. Test with a simple scenario
4. Run full test suite

