// Helpers shared by the extractors: flags, spans, step status and the Blocked error.
import type { Node } from 'web-tree-sitter';
import type { FileFlag, Flag, SourceSpan, Step, StepStatus, UnknownStep } from '../core/ir.js';
import { getRule, ruleMessage } from '../core/rules.js';
import type { RuleId } from '../core/rules.js';
import { deriveStepStatus } from '../core/status.js';

// Thrown while converting one statement. The statement becomes an unknown step with this rule.
export class Blocked extends Error {
  constructor(
    readonly ruleId: RuleId,
    readonly params: Record<string, string> = {},
  ) {
    super(ruleId);
  }
}

export const lineOf = (node: Node): number => node.startPosition.row + 1;

export function makeFlag(ruleId: RuleId, line: number, params?: Record<string, string>): Flag {
  return { level: getRule(ruleId).level, ruleId, message: ruleMessage(ruleId, params), line };
}

export function withStatus<T extends { kind: Step['kind']; flags: Flag[] }>(
  step: T,
): T & { status: StepStatus } {
  return { ...step, status: deriveStepStatus(step) };
}

export function spanOf(node: Node): SourceSpan {
  return {
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    text: node.text,
  };
}

// Named children without comments.
export function named(node: Node): Node[] {
  return node.namedChildren.filter((c): c is Node => c !== null && c.type !== 'comment');
}

// A flag that does not belong to a step. node is the source it points to.
export function fileFlag(
  ruleId: RuleId,
  node: Node,
  params?: Record<string, string>,
  assertionCount = 0,
  droppedTests: string[][] = [],
): FileFlag {
  const span = spanOf(node);
  return { ...makeFlag(ruleId, span.startLine, params), span, assertionCount, droppedTests };
}

// The unknown step for a statement that could not be converted.
export function blockedStep(error: Blocked, span: SourceSpan, assertionCount: number): UnknownStep {
  const flags = [makeFlag(error.ruleId, span.startLine, error.params)];
  return withStatus({ kind: 'unknown', assertionCount, span, flags });
}
