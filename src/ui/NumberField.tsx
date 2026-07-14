import { useEffect, useState } from 'react'

interface Props {
  label: string
  value: number
  onCommit: (v: number) => void
}

export function NumberField({ label, value, onCommit }: Props) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = () => {
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n)) {
      setText(String(value))
      return
    }
    onCommit(n)
    setText(String(value)) // re-sync now; if the store accepts a new value the [value] effect overwrites this
  }

  return (
    <label className="field">
      {label}
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </label>
  )
}
