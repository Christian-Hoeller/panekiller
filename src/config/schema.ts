import { z } from 'zod';

export const ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
export const RESERVED_IDS = ['ls', 'edit', 'kill', 'add', 'completions', 'help'] as const;

const id = z.string().regex(ID_PATTERN, 'must match ^[a-z0-9][a-z0-9-_]*$ (lowercase, digits, - and _)');
const env = z.record(z.string(), z.string());

export const editorSchema = z.strictObject({
  enabled: z.boolean().default(true).describe('Append an editor window to every session'),
  windowName: z.string().min(1).default('editor'),
  cmd: z.string().default('nvim .').describe('Typed into the editor window'),
});

const editorOverride = z.strictObject({
  enabled: z.boolean().optional(),
  windowName: z.string().min(1).optional(),
  cmd: z.string().optional(),
});

export const settingsSchema = z.strictObject({
  layout: z
    .strictObject({
      maxColumns: z.int().min(1).default(2).describe('Never more than this many panes side by side'),
      extraPane: z
        .enum(['left', 'right'])
        .default('left')
        .describe('Odd counts: which column gets the extra pane'),
    })
    .prefault({}),
  editor: editorSchema.prefault({}),
  appsWindowName: z.string().min(1).default('apps'),
  focus: z.enum(['apps', 'editor']).default('editor').describe('Window focused after creation'),
  paneTitles: z.boolean().default(false).describe('Set pane titles and pane-border-status top'),
  sendDelayMs: z
    .int()
    .min(0)
    .default(0)
    .describe('Wait before typing commands (for prompt themes that mangle early input)'),
});

export const paneSchema = z.union([
  z.string().describe('Command run in the project root'),
  z.strictObject({
    cmd: z.string().optional().describe('Typed into the shell and run; omit for a plain shell'),
    cwd: z.string().optional().describe('Relative to root, absolute or ~'),
    name: z.string().optional().describe('Pane title when paneTitles is on'),
    env: env.optional(),
  }),
]);

const baseFields = {
  root: z.string().min(1).describe('Project root, ~ expanded, must exist'),
  env: env.optional().describe('Applied to every pane and the editor'),
  editor: editorOverride.optional().describe('Deep-merged over settings.editor'),
};

export const layoutSchema = z.strictObject({
  id: id.optional().describe('Required when layouts is an array'),
  panes: z.array(paneSchema).min(1),
  root: baseFields.root.optional(),
  env: baseFields.env,
  editor: baseFields.editor,
});

export const projectSchema = z
  .strictObject({
    ...baseFields,
    layouts: z.union([layoutSchema, z.array(layoutSchema).min(1)]),
    default: id.optional().describe('Required when layouts is an array: the layout used without an argument'),
  })
  .superRefine((p, ctx) => {
    if (!Array.isArray(p.layouts)) {
      if (p.default !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['default'],
          message: 'not allowed when layouts is a single object',
        });
      }
      return;
    }
    const seen = new Set<string>();
    p.layouts.forEach((l, i) => {
      if (l.id === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['layouts', i, 'id'],
          message: 'required when layouts is an array',
        });
      } else if (seen.has(l.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['layouts', i, 'id'],
          message: `duplicate layout id "${l.id}"`,
        });
      } else {
        seen.add(l.id);
      }
    });
    if (p.default === undefined) {
      ctx.addIssue({ code: 'custom', path: ['default'], message: 'required when layouts is an array' });
    } else if (!seen.has(p.default)) {
      ctx.addIssue({
        code: 'custom',
        path: ['default'],
        message: `unknown layout "${p.default}" (layouts: ${[...seen].join(', ')})`,
      });
    }
  });

export const configSchema = z
  .strictObject({
    $schema: z.string().optional(),
    settings: settingsSchema.prefault({}),
    projects: z.record(z.string(), projectSchema).default({}),
  })
  .superRefine((c, ctx) => {
    for (const key of Object.keys(c.projects)) {
      if (!ID_PATTERN.test(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['projects', key],
          message: 'project id must match ^[a-z0-9][a-z0-9-_]*$',
        });
      } else if ((RESERVED_IDS as readonly string[]).includes(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['projects', key],
          message: `"${key}" is a reserved word (${RESERVED_IDS.join(', ')})`,
        });
      }
    }
  });

export type Config = z.output<typeof configSchema>;
export type Settings = z.output<typeof settingsSchema>;
export type Project = z.output<typeof projectSchema>;
export type Layout = z.output<typeof layoutSchema>;
export type Pane = z.output<typeof paneSchema>;
export type EditorSettings = z.output<typeof editorSchema>;

export function jsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(configSchema, { io: 'input', target: 'draft-07' }) as Record<string, unknown>;
  const projects = (schema.properties as Record<string, Record<string, unknown>>).projects;
  if (projects) {
    projects.propertyNames = { pattern: ID_PATTERN.source, not: { enum: [...RESERVED_IDS] } };
  }
  return {
    ...schema,
    title: 'panekiller config',
    description: 'Config for pk (panekiller). https://github.com/Christian-Hoeller/panekiller',
  };
}

export function jsonSchemaText(): string {
  return `${JSON.stringify(jsonSchema(), null, 2)}\n`;
}

/** Formats zod issues as `projects.clipboard.layouts[1].id: message`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${String(seg)}` : String(seg);
  }
  return out || '(root)';
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${formatPath(i.path)}: ${i.message}`);
}
