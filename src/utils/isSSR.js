export const isSSR = typeof window === 'undefined' || typeof window !== 'object' || !window || !window.document;
