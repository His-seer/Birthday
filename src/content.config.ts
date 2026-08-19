import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * CONTENT SCHEMA
 *
 * Two collections, because the content has two lifecycles:
 *
 *   timeline/  CUMULATIVE, append-only. One file per year. Migrates forward
 *              forever. Adding year N+1 means adding one file.
 *   years/     PER-YEAR. Message, the N things, hero/name config. Replaced
 *              annually. NOTHING from a previous year may appear here.
 *
 * They must not share a file. Last year they did (a single content.json), and
 * a full-overwrite save silently destroyed `messages` and `colors` (AUDIT H1).
 */

const ASPECT = /^\d+:\d+$/;

/**
 * Media is a discriminated union so that `poster` is REQUIRED on video.
 *
 * This is AUDIT H4 made structurally impossible rather than merely discouraged.
 * Last year 10 of 14 timeline entries were bare `<video controls>` with no
 * poster, so the section rendered as a column of black rectangles wearing
 * browser chrome — and the browser range-requested all 11 clips on load
 * (2,395 KB before any interaction). A video entry with no poster now fails
 * the build.
 */
const mediaSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('none'),
  }),
  z.object({
    kind: z.literal('image'),
    /** Extension-less base path. The pipeline owns the format/extension, so
     *  JPEG-bytes-in-a-.PNG-filename (AUDIT H3.3) cannot recur. */
    src: z.string().min(1),
    alt: z.string().min(1),
    /** Authored, never inferred. AUDIT/DESIGN found three unreconciled aspect
     *  ratios in one rail causing 2.4x card-height swings between rows. */
    aspect: z.string().regex(ASPECT, 'aspect must look like "4:3" or "9:16"'),
  }),
  z.object({
    kind: z.literal('video'),
    src: z.string().min(1),
    alt: z.string().min(1),
    aspect: z.string().regex(ASPECT, 'aspect must look like "4:3" or "9:16"'),
    /** REQUIRED. The poster frame IS the visual for every video entry. */
    poster: z.string().min(1),
  }),
]);

const timelineEvent = z.object({
  /** Stable, human-readable, never reused. Last year entries had no id and no
   *  date — they were identified by array index, so reordering silently
   *  rewrote history. */
  id: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be lower-kebab-case'),
  /** ISO date, or null to fall back to year-level grouping. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  title: z.string().min(1),
  /** Always renders, independent of media. Last year the `image`/`video`
   *  branches discarded `content` entirely, which is why all 14 entries are
   *  title-only (AUDIT N2). */
  story: z.string(),
  media: mediaSchema,
});

const timeline = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/timeline' }),
  schema: z
    .object({
      year: z.number().int().min(2000).max(2100),
      /** Chapter head, and the id for the year anchor. */
      label: z.string().min(1),
      events: z.array(timelineEvent),
    })
    .superRefine((data, ctx) => {
      const seen = new Set<string>();
      for (const [i, event] of data.events.entries()) {
        if (seen.has(event.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['events', i, 'id'],
            message: `Duplicate event id "${event.id}". Ids must be unique within a year.`,
          });
        }
        seen.add(event.id);
      }
    }),
});

const years = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/years' }),
  schema: z.object({
    year: z.number().int().min(2000).max(2100),

    /**
     * All three names are intentional and this year's variety is deliberate.
     * Hero uses `primary`; the things-list heading uses its own `titleName`.
     * Last year's Bryan/Bruce/Brucey mismatch was an accidental bug caused by
     * the name being hardcoded in four places (AUDIT H1/N4). Every surface now
     * reads from here. No name appears in any template.
     */
    names: z.object({
      primary: z.string().min(1),
      alternates: z.array(z.string().min(1)),
    }),

    hero: z.object({
      greeting: z.string().min(1),
      subtitle: z.string(),
    }),

    meta: z.object({
      title: z.string().min(1),
      description: z.string(),
      /** Extension-less base. Must be a title card, NOT a personal photo. */
      ogImage: z.string().min(1),
    }),

    message: z
      .object({
      title: z.string(),
      /** Optional message film, extension-less like every other media ref.
       *  When present the letter is spoken rather than written, so the
       *  placeholder paragraphs are suppressed — see Letter.astro. */
      video: z.string().min(1).optional(),
      /** Required whenever `video` is set: the poster is what she sees until
       *  she chooses to play, so it must be described. */
      videoAlt: z.string().min(1).optional(),
      /** ARRAY of any length. Last year hardcoded 6 <p> tags but wired only 3
       *  (messageText1..3), so paragraphs 4-6 were unreachable by design. */
      paragraphs: z.array(z.string()).min(1),
      /** ARRAY. Last year had two .message-highlight elements but the selector
       *  was querySelector (singular), so the second could never be edited. */
      closing: z.array(z.string()),
      signature: z.string(),
      })
      .refine((v) => !v.video || Boolean(v.videoAlt), {
        message: 'message.videoAlt is required when message.video is set',
        path: ['videoAlt'],
      }),

    /**
     * The closing write-up — the last words on the page, above the flourish.
     *
     * Distinct from `message`, which is the letter and sits SECOND by design
     * (see index.astro). This is the 2025 edition's end-of-page note, which the
     * client asked to keep: "I like that there was a write up at the end of the
     * 2025 one". On the 2025 page that was `archive.closing`.
     *
     * OPTIONAL, and Closing.astro renders its rule with or without it — a year
     * is allowed to end on the flourish alone. `salutation` and `signoff` are
     * separate from `paragraphs` because they are set in the display face,
     * not the body face.
     */
    farewell: z
      .object({
        salutation: z.string().min(1).optional(),
        paragraphs: z.array(z.string().min(1)).min(1),
        signoff: z.string().min(1).optional(),
      })
      .optional(),

    items: z
      .object({
        /** Optional film that carries the list instead of text. Same contract as
         *  message.video: when present the placeholder entries are suppressed,
         *  and real entries still render alongside it. */
        video: z.string().min(1).optional(),
        videoAlt: z.string().min(1).optional(),
        /** Count is DERIVED from entries.length and interpolated here.
         *
         *  The brief locks the heading verbatim as "24 Things I love about
         *  Bruce" AND forbids hardcoding the count. A literal "24" is the exact
         *  bug that titled last year's site "23" over non-matching content.
         *  With 24 entries this template renders the locked string
         *  character-for-character; with any other count it stays truthful. */
        titleTemplate: z.string().includes('{count}').includes('{name}'),
        titleName: z.string().min(1),
        entries: z.array(z.string()),
      })
      .refine((v) => v.entries.length > 0, {
        message: 'items.entries must not be empty',
        path: ['entries'],
      })
      .refine((v) => !v.video || Boolean(v.videoAlt), {
        message: 'items.videoAlt is required when items.video is set',
        path: ['videoAlt'],
      }),

    /**
     * Gallery video, shown as a uniform contact sheet beneath the photographs.
     *
     * Separate from `gallery` on purpose. Interleaving clips into the photo
     * grid was tried and looks ragged: every tile a different shape and play
     * marks at random heights. Photographs earn their native aspect because
     * DESIGN.md 2.5 argues adjacency-and-comparison is the point; clips earn a
     * single uniform tile because thirty-odd of them only read as a set if they
     * share a shape. `aspect` is the clip's REAL ratio (the poster needs it);
     * the uniform framing is applied at render.
     */
    clips: z
      .array(
        z.object({
          src: z.string().min(1),
          alt: z.string().min(1),
          aspect: z.string().regex(ASPECT),
        })
      )
      .default([]),

    gallery: z.array(
      z.object({
        src: z.string().min(1),
        /** Per-photo. Last year all 14 shared the alt text "Memory photo"
         *  (AUDIT M1). */
        alt: z.string().min(1),
        caption: z.string(),
        aspect: z.string().regex(ASPECT),
        /** Promoted to a full-width plate for rhythm (DESIGN.md 3.6 #3). */
        plate: z.boolean().default(false),
      })
    ),
  }),
});

export const collections = { timeline, years };
