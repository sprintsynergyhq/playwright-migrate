export const SOURCE_FRAMEWORKS = ['cypress-js', 'selenium-python', 'selenium-java'] as const;

export type SourceFramework = (typeof SOURCE_FRAMEWORKS)[number];

export type Detection = { path: string; framework: SourceFramework | 'unknown'; reason: string };

/**
 * Process exit codes:
 * 0 converted with no blocked items,
 * 1 tool error,
 * 2 conversion finished with blocked items (used from PR 2).
 */
export const ExitCode = { Ok: 0, ToolError: 1, Blocked: 2 } as const;

/** Where commands write output. `out` and `err` each receive one message without a trailing newline. */
export type Io = { out: (s: string) => void; err: (s: string) => void };
