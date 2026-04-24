import { createClient } from 'next-sanity'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import imageUrlBuilder from '@sanity/image-url'

export const client = createClient({
  projectId: 'sxvnlq4t',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: process.env.NODE_ENV === 'production',
})

const builder = imageUrlBuilder(client)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function urlFor(source: any) {
  return builder.image(source)
}

// Helper to fetch data
export async function sanityFetch<T>({
  query,
  params = {},
  tags = [],
}: {
  query: string
  params?: Record<string, unknown>
  tags?: string[]
}): Promise<T> {
  return client.fetch<T>(query, params, {
    next: {
      revalidate: process.env.NODE_ENV === 'development' ? 30 : 3600,
      tags,
    },
  })
}
