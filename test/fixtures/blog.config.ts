// A generic config shaped like the output of Payload's buildConfig.
// It is a plain object, so the tests do not need Payload installed.
// Each collection exists to hit one of the traps listed in CLAUDE.md.

// Shared block: defined once here, referenced by slug through blockReferences.
const linkBlock = {
  slug: 'link',
  fields: [{ name: 'page', type: 'relationship', relationTo: 'pages' }],
}

// Added by the first plugin below, so it should be detected as a plugin collection.
const redirects = {
  slug: 'redirects',
  fields: [{ name: 'to', type: 'relationship', relationTo: ['pages', 'posts'] }],
}

export default {
  blocks: [linkBlock],
  collections: [
    {
      slug: 'users',
      // Join field: points at posts through "collection", not "relationTo".
      fields: [{ name: 'posts', type: 'join', collection: 'posts', on: 'author' }],
    },
    {
      slug: 'media',
      // Points only at an internal collection, so it must disappear completely.
      fields: [{ name: 'folder', type: 'relationship', relationTo: 'payload-folders' }],
    },
    {
      slug: 'pages',
      fields: [
        {
          type: 'tabs',
          tabs: [
            {
              // Unnamed tab: adds nothing to the field path.
              label: 'Content',
              fields: [
                {
                  name: 'layout',
                  type: 'blocks',
                  blocks: [
                    {
                      slug: 'hero',
                      fields: [{ name: 'image', type: 'upload', relationTo: 'media' }],
                    },
                  ],
                  blockReferences: ['link'],
                },
              ],
            },
            {
              // Named tab: becomes part of the field path.
              name: 'meta',
              fields: [{ name: 'image', type: 'upload', relationTo: 'media' }],
            },
          ],
        },
        { name: 'author', type: 'relationship', relationTo: 'users' },
      ],
    },
    {
      slug: 'posts',
      fields: [
        {
          name: 'related',
          type: 'array',
          fields: [{ name: 'doc', type: 'relationship', relationTo: ['posts', 'pages'] }],
        },
        {
          name: 'details',
          type: 'group',
          fields: [{ name: 'cover', type: 'upload', relationTo: 'media' }],
        },
        { name: 'author', type: 'relationship', relationTo: 'users' },
        {
          // richText (Lexical): relations live in the editor's features, not in fields.
          name: 'body',
          type: 'richText',
          editor: {
            editorConfig: {
              resolvedFeatureMap: new Map<string, object>([
                ['bold', {}],
                [
                  'link',
                  {
                    sanitizedServerFeatureProps: {
                      fields: [{ name: 'doc', type: 'relationship', relationTo: ['pages', 'posts'] }],
                    },
                  },
                ],
                [
                  'blocks',
                  {
                    sanitizedServerFeatureProps: {
                      blocks: [
                        {
                          slug: 'mediaBlock',
                          fields: [{ name: 'media', type: 'upload', relationTo: 'media' }],
                        },
                      ],
                    },
                  },
                ],
                ['upload', { sanitizedServerFeatureProps: { enabledCollectionSlugs: ['media'] } }],
                [
                  'relationship',
                  {
                    // No limit set, so every collection is allowed: shown as "*".
                    sanitizedServerFeatureProps: {
                      enabledCollectionSlugs: [
                        'users',
                        'media',
                        'pages',
                        'posts',
                        'payload-folders',
                        'redirects',
                        'search',
                      ],
                    },
                  },
                ],
              ]),
            },
          },
        },
      ],
    },
    {
      // Internal collection: must be skipped as a source.
      slug: 'payload-folders',
      fields: [{ name: 'parent', type: 'relationship', relationTo: 'payload-folders' }],
    },
    redirects,
    {
      // Added by the second plugin, which throws on replay, so it counts as the user's own.
      slug: 'search',
      fields: [{ name: 'doc', type: 'relationship', relationTo: 'posts' }],
    },
  ],
  globals: [
    {
      slug: 'footer',
      fields: [
        {
          name: 'nav',
          type: 'array',
          fields: [{ name: 'page', type: 'relationship', relationTo: 'pages' }],
        },
      ],
    },
  ],
  plugins: [
    (config: { collections: unknown[] }) => ({
      ...config,
      collections: [...config.collections, redirects],
    }),
    () => {
      throw new Error('This plugin needs a full config')
    },
  ],
}
