export { detectPath, detectSource } from './core/detect.js';
export { ExitCode, SOURCE_FRAMEWORKS } from './core/types.js';
export type { Detection, Io, SourceFramework } from './core/types.js';
export { getVersion } from './version.js';
export type * from './core/ir.js';
export { getRule, isRuleId, ruleMessage, RULES } from './core/rules.js';
export type { FlagLevel, RuleDefinition, RuleId } from './core/rules.js';
export { deriveFileStatus, deriveStepStatus, deriveTestStatus } from './core/status.js';
export type { FileStatus, TestStatus } from './core/status.js';
export {
  buildFileReport,
  buildRunReport,
  exitCodeFor,
  exitCodeForReports,
  renderReportJson,
  renderReportMarkdown,
  toGoldenReport,
} from './core/report.js';
export type { FileReport, GoldenReport, RunReport } from './core/report.js';
export { checkInvariants, findInvariantProblems, InvariantError } from './core/invariants.js';
export { emitPlaywright } from './emit/playwright.js';
export { parseSource, ParseError } from './parse/treeSitter.js';
export { convertSource, isConvertible, UnsupportedSourceError } from './core/convert.js';
export type { Conversion } from './core/convert.js';
export {
  DEFAULT_OUT_DIR,
  findExistingFiles,
  MigrationError,
  planMigration,
  REPORT_JSON,
  REPORT_MD,
  writeMigration,
} from './core/migrate.js';
export type { MigrationOptions, MigrationPlan, PlannedFile } from './core/migrate.js';
export { PLAYWRIGHT_CONFIG_FILE, renderPlaywrightConfig } from './emit/config.js';
export { specFileName } from './sources/index.js';
