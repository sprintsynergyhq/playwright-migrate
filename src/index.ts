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
