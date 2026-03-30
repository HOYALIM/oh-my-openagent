/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"
import { createTimestampTransformer, createTimestampedStdoutController } from "./timestamp-output"

function createUtcDate(hours: number, minutes: number, seconds: number): Date {
  return new Date(Date.UTC(2026, 1, 19, hours, minutes, seconds))
}

function formatExpectedTimestamp(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `[${hh}:${mm}:${ss}]`
}

interface MockWriteStream {
  write: (
    chunk: Uint8Array | string,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ) => boolean
  writes: string[]
}

function createMockWriteStream(): MockWriteStream {
  const writes: string[] = []

  const write: MockWriteStream["write"] = (
    chunk,
    encodingOrCallback,
    callback,
  ) => {
    const text = typeof chunk === "string"
      ? chunk
      : Buffer.from(chunk).toString(typeof encodingOrCallback === "string" ? encodingOrCallback : undefined)

    writes.push(text)

    if (typeof encodingOrCallback === "function") {
      encodingOrCallback(null)
    } else if (callback) {
      callback(null)
    }

    return true
  }

  return { write, writes }
}

describe("createTimestampTransformer", () => {
  it("prefixes each output line with timestamp", () => {
    // given
    const nowDate = createUtcDate(12, 34, 56)
    const now = () => nowDate
    const transform = createTimestampTransformer(now)

    // when
    const output = transform("hello\nworld")

    // then
    const timestamp = formatExpectedTimestamp(nowDate)
    expect(output).toBe(`${timestamp} hello\n${timestamp} world`)
  })

  it("keeps line-start state across chunk boundaries", () => {
    // given
    const nowDate = createUtcDate(1, 2, 3)
    const now = () => nowDate
    const transform = createTimestampTransformer(now)

    // when
    const first = transform("hello")
    const second = transform(" world")
    const third = transform("\nnext")

    // then
    const timestamp = formatExpectedTimestamp(nowDate)
    expect(first).toBe(`${timestamp} hello`)
    expect(second).toBe(" world")
    expect(third).toBe(`\n${timestamp} next`)
  })

  it("returns empty string for empty chunk", () => {
    // given
    const nowDate = createUtcDate(1, 2, 3)
    const transform = createTimestampTransformer(() => nowDate)

    // when
    const output = transform("")

    // then
    expect(output).toBe("")
  })
})

describe("createTimestampedStdoutController", () => {
  it("prefixes stdout writes when enabled", () => {
    // given
    const stdout = createMockWriteStream()
    const controller = createTimestampedStdoutController(stdout as unknown as NodeJS.WriteStream)

    // when
    controller.enable()
    stdout.write("hello\nworld")

    // then
    expect(stdout.writes).toHaveLength(1)
    expect(stdout.writes[0]!).toMatch(/^\[\d{2}:\d{2}:\d{2}\] hello\n\[\d{2}:\d{2}:\d{2}\] world$/)
  })

  it("restores original write function", () => {
    // given
    const stdout = createMockWriteStream()
    const controller = createTimestampedStdoutController(stdout as unknown as NodeJS.WriteStream)
    controller.enable()

    // when
    stdout.write("before restore")
    controller.restore()
    stdout.write("after restore")

    // then
    expect(stdout.writes).toHaveLength(2)
    expect(stdout.writes[0]!).toMatch(/^\[\d{2}:\d{2}:\d{2}\] before restore$/)
    expect(stdout.writes[1]).toBe("after restore")
  })

  it("supports Uint8Array chunks and encoding", () => {
    // given
    const stdout = createMockWriteStream()
    const controller = createTimestampedStdoutController(stdout as unknown as NodeJS.WriteStream)

    // when
    controller.enable()
    stdout.write(Buffer.from("byte line"), "utf8")

    // then
    expect(stdout.writes).toHaveLength(1)
    expect(stdout.writes[0]!).toMatch(/^\[\d{2}:\d{2}:\d{2}\] byte line$/)
  })
})
