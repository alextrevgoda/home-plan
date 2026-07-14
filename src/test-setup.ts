import '@testing-library/jest-dom/vitest'

// jsdom does not implement matchMedia. Default stub: desktop layout (matches: false).
// Tests that need mobile mock window.matchMedia themselves.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
