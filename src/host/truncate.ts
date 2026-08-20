/**
 * UTF-8–safe head/tail truncation for stored tool output.
 *
 * Lives on the host (not in shared/) so `events.ts` stays dependency-free.
 * Uses `TextEncoder` / `TextDecoder` rather than `Buffer` so the byte count
 * matches what a browser would compute for the same string.
 *
 * @module dsh-harness-call/host/truncate
 */

import { DEFAULT_MAX_TOOL_OUTPUT_BYTES } from '../shared/events.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8')

export { DEFAULT_MAX_TOOL_OUTPUT_BYTES }

/** UTF-8 byte length of a JS string. */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).byteLength
}

function isContinuation(byte: number): boolean {
  return (byte & 0xc0) === 0x80
}

/** How many bytes the lead byte of a UTF-8 sequence claims. */
function sequenceLength(lead: number): number {
  if (lead <= 0x7f) return 1
  if ((lead & 0xe0) === 0xc0) return 2
  if ((lead & 0xf0) === 0xe0) return 3
  if ((lead & 0xf8) === 0xf0) return 4
  return 1
}

/**
 * Decode `bytes` as UTF-8, dropping a trailing incomplete multi-byte sequence
 * rather than inserting U+FFFD. A cut that landed mid-surrogate (a 4-byte
 * scalar) is the same case: the whole scalar is dropped from this side.
 */
export function decodeUtf8Prefix(bytes: Uint8Array): string {
  let end = bytes.length
  if (end === 0) return ''
  let leadAt = end
  while (leadAt > 0 && isContinuation(bytes[leadAt - 1]!)) leadAt -= 1
  if (leadAt === 0) return ''
  const lead = bytes[leadAt - 1]!
  const have = end - (leadAt - 1)
  if (sequenceLength(lead) > have) end = leadAt - 1
  return decoder.decode(bytes.subarray(0, end))
}

/**
 * Decode `bytes` as UTF-8, skipping leading continuation bytes so the suffix
 * starts on a character boundary.
 */
export function decodeUtf8Suffix(bytes: Uint8Array): string {
  let start = 0
  const end = bytes.length
  while (start < end && isContinuation(bytes[start]!)) start += 1
  return decoder.decode(bytes.subarray(start, end))
}

export interface TruncatedText {
  text: string
  truncated: boolean
  originalBytes: number
}

/**
 * Keep the first 3/4 and last 1/4 of `maxBytes` (12 KiB + 4 KiB at the
 * default), split on UTF-8 character boundaries. A short `\n…\n` marker is
 * inserted between the halves and is not charged against the budget — the
 * cap is about the payload, not the ellipsis.
 */
export function truncateHeadTail(text: string, maxBytes: number): TruncatedText {
  const bytes = encoder.encode(text)
  const originalBytes = bytes.byteLength
  if (originalBytes <= maxBytes) return { text, truncated: false, originalBytes }
  const headBudget = Math.floor(maxBytes * 3 / 4)
  const tailBudget = Math.max(0, maxBytes - headBudget)
  const head = decodeUtf8Prefix(bytes.subarray(0, headBudget))
  const tail = decodeUtf8Suffix(bytes.subarray(Math.max(0, originalBytes - tailBudget)))
  return { text: `${head}\n…\n${tail}`, truncated: true, originalBytes }
}
