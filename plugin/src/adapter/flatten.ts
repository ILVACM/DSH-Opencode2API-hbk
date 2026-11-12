import type { HarnessBlock, HarnessGenerateOptions, HarnessMessage } from '../types.ts'

function blockText(blocks: HarnessBlock[]): string {
  const parts: string[] = []
  for (const b of blocks) {
    if (b.type === 'text') parts.push(b.text)
    else if (b.type === 'reasoning') parts.push('[reasoning omitted]')
    else if (b.type === 'tool-call') parts.push(`[assistant attempted tool call: ${b.name}]`)
    else if (b.type === 'image') parts.push('[image omitted]')
    else if (b.type === 'tool-result') {
      const inner = blockText(b.content)
      parts.push(`[tool result for ${b.toolCallId}] ${inner}`.trim())
    }
  }
  return parts.join('\n')
}

export function flattenHistory(options: HarnessGenerateOptions, toolsEnabled = false): string {
  const msgs: HarnessMessage[] = options.messages
  let promptIdx = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') { promptIdx = i; break }
  }
  if (promptIdx < 0) throw new Error('no user message in conversation (INVALID_REQUEST)')
  const promptText = blockText(msgs[promptIdx].content).trim()
  if (promptText.length === 0) throw new Error('current user message is empty (INVALID_REQUEST)')
  const sections: string[] = []
  if (options.system !== undefined && options.system.trim().length > 0) {
    sections.push('[System Instructions]\n' + options.system.trim())
  }
  const history = msgs.filter((_, i) => i !== promptIdx)
  if (history.length > 0) {
    const lines = history.map((m) => `[${m.role}]: ` + blockText(m.content).trim())
    sections.push('[Conversation History]\n' + lines.join('\n\n'))
  }
  sections.push('[Current User Message]\n' + promptText)
  sections.push(toolsEnabled
    ? 'You may use the available tools to complete the task, then give the final answer in plain text.'
    : 'You have no tools in this channel; reply in plain text.')
  return sections.join('\n\n')
}