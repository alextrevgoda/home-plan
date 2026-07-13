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
    if (Number.isFinite(n)) onCommit(n)
    else setText(String(value))
  }

  return (
    <label className="field">
      {label}
      <input
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
