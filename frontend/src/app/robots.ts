import { MetadataRoute } from 'next'
import { resolveSiteUrl } from '@/lib/seo-server'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await resolveSiteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/account', '/history', '/library', '/login', '/notifications', '/search', '/manga/*/*/processing'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: `${siteUrl}/`,
  }
}
