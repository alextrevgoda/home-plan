import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { CatalogPanel } from './CatalogPanel'

describe('CatalogPanel', () => {
  beforeEach(() => {
    usePlanStore.setState({ placingFurniture: null, placing: null, selection: null })
  })

  it('shows bedroom items by default and switches categories', () => {
    render(<CatalogPanel />)
    expect(screen.getByRole('button', { name: /double bed/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /bathroom/i }))
    expect(screen.getByRole('button', { name: /bathtub/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /double bed/i })).not.toBeInTheDocument()
  })

  it('clicking an item arms placement; clicking again disarms', () => {
    render(<CatalogPanel />)
    const bed = screen.getByRole('button', { name: /double bed/i })
    fireEvent.click(bed)
    expect(usePlanStore.getState().placingFurniture).toBe('bed-double')
    fireEvent.click(bed)
    expect(usePlanStore.getState().placingFurniture).toBeNull()
  })
})
