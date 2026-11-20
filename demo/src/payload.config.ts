// A generic demo shop, used only to record the GIF in the README (see demo/demo.tape).
// Like the test fixtures it is a plain object shaped like a built Payload config,
// so recording the demo does not need Payload installed.
// It follows common Payload patterns (layout blocks, SEO groups, nested docs, variants),
// so hubs like "media" collect many fields, the way they do in real projects.

const image = (name: string) => ({ name, type: 'upload', relationTo: 'media' })
const link = (name: string, relationTo: string | string[] = 'pages') => ({
  name,
  type: 'relationship',
  relationTo,
})

// Shared block: defined once and used through blockReferences.
const ctaBlock = { slug: 'cta', fields: [link('link')] }

const seo = { name: 'meta', type: 'group', fields: [image('image')] }

const breadcrumbs = (relationTo: string) => ({
  name: 'breadcrumbs',
  type: 'array',
  fields: [link('doc', relationTo)],
})

export default {
  blocks: [ctaBlock],
  collections: [
    {
      slug: 'users',
      fields: [
        image('avatar'),
        { name: 'orders', type: 'join', collection: 'orders', on: 'customer' },
        { name: 'reviews', type: 'join', collection: 'reviews', on: 'author' },
      ],
    },
    { slug: 'media', fields: [{ name: 'alt', type: 'text' }] },
    {
      slug: 'categories',
      fields: [link('parent', 'categories'), breadcrumbs('categories'), image('image')],
    },
    {
      slug: 'products',
      fields: [
        {
          type: 'tabs',
          tabs: [
            {
              label: 'General',
              fields: [{ ...link('categories', 'categories'), hasMany: true }],
            },
            {
              label: 'Media',
              fields: [
                { ...image('images'), hasMany: true },
                { name: 'gallery', type: 'array', fields: [image('image')] },
              ],
            },
            {
              label: 'Variants',
              fields: [
                {
                  name: 'variants',
                  type: 'array',
                  fields: [image('image'), { name: 'swatches', type: 'array', fields: [image('image')] }],
                },
              ],
            },
            { label: 'SEO', fields: [seo] },
          ],
        },
        { ...link('relatedProducts', 'products'), hasMany: true },
        { name: 'upsells', type: 'array', fields: [link('product', 'products')] },
        { name: 'reviews', type: 'join', collection: 'reviews', on: 'product' },
      ],
    },
    {
      slug: 'orders',
      fields: [
        link('customer', 'users'),
        { name: 'items', type: 'array', fields: [link('product', 'products')] },
      ],
    },
    {
      slug: 'reviews',
      fields: [link('product', 'products'), link('author', 'users'), { ...image('photos'), hasMany: true }],
    },
    {
      slug: 'pages',
      fields: [
        {
          type: 'tabs',
          tabs: [
            {
              label: 'Content',
              fields: [
                {
                  name: 'layout',
                  type: 'blocks',
                  blocks: [
                    { slug: 'hero', fields: [image('image'), link('link')] },
                    { slug: 'mediaBlock', fields: [image('media')] },
                    {
                      slug: 'gallery',
                      fields: [{ name: 'images', type: 'array', fields: [image('image')] }],
                    },
                    { slug: 'banner', fields: [image('image'), link('link')] },
                    {
                      slug: 'featuredProducts',
                      fields: [{ ...link('products', 'products'), hasMany: true }],
                    },
                    {
                      slug: 'productCarousel',
                      fields: [{ ...link('products', 'products'), hasMany: true }],
                    },
                    {
                      slug: 'categoryTeaser',
                      fields: [link('category', 'categories'), image('image')],
                    },
                    {
                      slug: 'testimonials',
                      fields: [{ name: 'items', type: 'array', fields: [image('avatar')] }],
                    },
                  ],
                  blockReferences: ['cta'],
                },
              ],
            },
            { label: 'SEO', fields: [seo] },
          ],
        },
        link('parent'),
        breadcrumbs('pages'),
      ],
    },
  ],
  globals: [
    {
      slug: 'header',
      fields: [
        image('logo'),
        {
          name: 'nav',
          type: 'array',
          fields: [
            link('link', ['pages', 'categories']),
            { name: 'children', type: 'array', fields: [link('link', ['pages', 'products'])] },
          ],
        },
      ],
    },
  ],
}
