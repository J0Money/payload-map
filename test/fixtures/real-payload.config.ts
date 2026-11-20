// A config built by Payload's real buildConfig, so the tests notice when Payload changes
// the shape of a built config. Unlike the other fixtures it needs Payload installed
// (a dev dependency). No database adapter is needed, because Payload never starts.
import { BlocksFeature, lexicalEditor, LinkFeature } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'

export default buildConfig({
  secret: 'test-only',
  editor: lexicalEditor(),
  // Shared block, used below through blockReferences.
  blocks: [{ slug: 'cta', fields: [{ name: 'link', type: 'relationship', relationTo: 'posts' }] }],
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [{ name: 'posts', type: 'join', collection: 'posts', on: 'author' }],
    },
    { slug: 'media', upload: true, fields: [] },
    {
      slug: 'posts',
      fields: [
        { name: 'author', type: 'relationship', relationTo: 'users' },
        { name: 'layout', type: 'blocks', blocks: [], blockReferences: ['cta'] },
        {
          name: 'content',
          type: 'richText',
          editor: lexicalEditor({
            features: ({ defaultFeatures }) => [
              ...defaultFeatures,
              LinkFeature({ enabledCollections: ['posts'] }),
              BlocksFeature({
                blocks: [
                  {
                    slug: 'mediaBlock',
                    fields: [{ name: 'media', type: 'upload', relationTo: 'media' }],
                  },
                ],
              }),
            ],
          }),
        },
      ],
    },
  ],
})
