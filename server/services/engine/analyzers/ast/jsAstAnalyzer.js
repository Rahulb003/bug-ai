import { parse } from "@babel/parser";
import { finding } from "../../findingEngine.js";
import { sourceLine } from "../shared.js";

const CP_MODULES = new Set(["child_process", "node:child_process"]);
const CP_METHODS = new Set(["exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync", "fork"]);
const SECRET_NAME = /password|api[_-]?key|secret|token/i;
const SQL_TEXT = /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i;
const TAINT_ROOTS = new Set(["req", "request", "input", "params", "userInput", "query"]);

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "range" || key === "leadingComments" || key === "trailingComments") continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node));
    else if (value && typeof value.type === "string") walk(value, visit, node);
  }
}

const nameOf = (node) => node && (node.type === "Identifier" ? node.name : node.type === "StringLiteral" ? node.value : null);
const isString = (node) => node && node.type === "StringLiteral";
const memberProperty = (node) => (node && node.type === "MemberExpression" && !node.computed ? nameOf(node.property) : null);

// Is this expression rooted in something that looks externally controlled?
function looksTainted(node) {
  let current = node;
  while (current && current.type === "MemberExpression") current = current.object;
  return !!current && current.type === "Identifier" && TAINT_ROOTS.has(current.name);
}

// Which local names refer to child_process, so a method named exec() on an
// unrelated object is never mistaken for a shell call.
function collectChildProcessBindings(program) {
  const namespaces = new Set(["child_process", "childProcess"]);
  const functions = new Set();
  walk(program, (node) => {
    if (node.type === "VariableDeclarator" && node.init && node.init.type === "CallExpression" &&
        nameOf(node.init.callee) === "require" && isString(node.init.arguments[0]) && CP_MODULES.has(node.init.arguments[0].value)) {
      if (node.id.type === "Identifier") namespaces.add(node.id.name);
      else if (node.id.type === "ObjectPattern") node.id.properties.forEach((p) => { const n = nameOf(p.value) || nameOf(p.key); if (n) functions.add(n); });
    }
    if (node.type === "ImportDeclaration" && CP_MODULES.has(node.source.value)) {
      node.specifiers.forEach((s) => {
        if (s.type === "ImportSpecifier") functions.add(s.local.name);
        else namespaces.add(s.local.name);
      });
    }
  });
  return { namespaces, functions };
}

export function jsAstAnalyzer({ source, language, file }) {
  let ast;
  try {
    ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"], errorRecovery: true });
  } catch {
    // Parsing genuinely failed — don't crash, don't fabricate findings. The
    // syntaxAnalyzer's bracket matching still covers gross syntax errors here.
    return [];
  }

  const results = [];
  const { namespaces, functions } = collectChildProcessBindings(ast.program);
  const add = (node, details) => {
    const line = node.loc?.start.line || 1;
    results.push(finding({ file, language, line, column: (node.loc?.start.column ?? 0) + 1, originalCode: sourceLine(source, line), ...details }));
  };
  const security = (node, rule, title, description, evidence, recommendation, cwe, severity = "HIGH") =>
    add(node, { category: "security", severity, rule, title, description, evidence: [evidence], recommendation, references: cwe ? [cwe] : [], impact: "May expose application data or code execution.", source: "ast-security-analyzer" });
  const runtime = (node, rule, title, description, evidence, recommendation, severity = "HIGH") =>
    add(node, { category: "runtime", severity, rule, title, description, evidence: [evidence], recommendation, source: "ast-runtime-analyzer" });

  walk(ast.program, (node) => {
    // BUGAI-SEC-001 — dynamic code execution, only as a bare eval/Function call.
    if ((node.type === "CallExpression" || node.type === "NewExpression") && node.callee.type === "Identifier" && ["eval", "Function"].includes(node.callee.name)) {
      security(node, "BUGAI-SEC-001", "Dynamic code execution", "Untrusted input reaching this primitive may execute arbitrary code.", node.callee.name, "Avoid dynamic execution; use a safe parser or an allowlist.", "CWE-95", "CRITICAL");
    }

    // BUGAI-SEC-002 — command injection, resolved through real child_process bindings.
    if (node.type === "CallExpression") {
      const direct = node.callee.type === "Identifier" && functions.has(node.callee.name);
      const viaNamespace = node.callee.type === "MemberExpression" && !node.callee.computed &&
        node.callee.object.type === "Identifier" && namespaces.has(node.callee.object.name) && CP_METHODS.has(memberProperty(node.callee));
      if (direct || viaNamespace) {
        security(node, "BUGAI-SEC-002", "Potential command injection", "Command execution needs strict argument handling.",
          direct ? node.callee.name : `${node.callee.object.name}.${memberProperty(node.callee)}`,
          "Use an argument array, avoid shell mode, and allowlist values.", "CWE-78");
      }
    }

    // BUGAI-SEC-003 — SQL built by interpolation or concatenation, from real nodes only.
    if (node.type === "TemplateLiteral" && node.expressions.length && SQL_TEXT.test(node.quasis.map((q) => q.value.cooked || "").join(" "))) {
      security(node, "BUGAI-SEC-003", "Potential SQL injection", "A query appears to be dynamically composed.", "template literal with interpolation", "Use parameterized queries.", "CWE-89");
    }
    if (node.type === "BinaryExpression" && node.operator === "+") {
      const literalSide = [node.left, node.right].find((side) => isString(side) && SQL_TEXT.test(side.value));
      const dynamicSide = [node.left, node.right].find((side) => side && side.type !== "StringLiteral");
      if (literalSide && dynamicSide) {
        security(node, "BUGAI-SEC-003", "Potential SQL injection", "A query appears to be dynamically composed.", "string concatenation into SQL", "Use parameterized queries.", "CWE-89");
      }
    }

    // BUGAI-SEC-004 — HTML sinks, matched as assignment targets and document calls.
    if (node.type === "AssignmentExpression" && ["innerHTML", "outerHTML"].includes(memberProperty(node.left))) {
      security(node, "BUGAI-SEC-004", "Potential cross-site scripting sink", "Untrusted content assigned to an HTML sink can run script in a browser.", memberProperty(node.left), "Use textContent or a context-aware sanitizer.", "CWE-79");
    }
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression" &&
        nameOf(node.callee.object) === "document" && ["write", "writeln"].includes(memberProperty(node.callee))) {
      security(node, "BUGAI-SEC-004", "Potential cross-site scripting sink", "Untrusted content assigned to an HTML sink can run script in a browser.", `document.${memberProperty(node.callee)}`, "Use textContent or a context-aware sanitizer.", "CWE-79");
    }

    // BUGAI-SEC-005 — a credential-shaped name bound to a string literal.
    const secretPairs = [];
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && isString(node.init)) secretPairs.push([node.id.name, node.init.value]);
    if ((node.type === "ObjectProperty" || node.type === "Property") && isString(node.value)) secretPairs.push([nameOf(node.key), node.value.value]);
    if (node.type === "AssignmentExpression" && isString(node.right)) secretPairs.push([nameOf(node.left) || memberProperty(node.left), node.right.value]);
    for (const [key, value] of secretPairs) {
      if (key && SECRET_NAME.test(key) && String(value).length >= 6) {
        security(node, "BUGAI-SEC-005", "Possible hardcoded secret", "A credential-like value is embedded in source.", key, "Move the value to a secret manager or environment configuration and rotate it if real.", "CWE-798");
      }
    }

    // BUGAI-SEC-006 — path building from external input or a traversal literal.
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression" &&
        nameOf(node.callee.object) === "path" && ["join", "resolve"].includes(memberProperty(node.callee))) {
      const risky = node.arguments.some((arg) => looksTainted(arg) || (isString(arg) && arg.value.includes("..")));
      if (risky) {
        security(node, "BUGAI-SEC-006", "Potential path traversal", "File path construction appears to include external input.", `path.${memberProperty(node.callee)}`, "Resolve against an allowlisted base directory and reject traversal.", "CWE-22", "MEDIUM");
      }
    }

    // BUGAI-RUN-001 — division by a literal zero.
    if (node.type === "BinaryExpression" && node.operator === "/" && node.right.type === "NumericLiteral" && node.right.value === 0) {
      runtime(node, "BUGAI-RUN-001", "Literal division by zero", "A zero denominator will fail at runtime.", "/ 0", "Validate the denominator before division.", "CRITICAL");
    }

    // BUGAI-RUN-002 — a loop that cannot terminate on its own condition.
    if ((node.type === "WhileStatement" || node.type === "DoWhileStatement") && node.test.type === "BooleanLiteral" && node.test.value === true) {
      runtime(node, "BUGAI-RUN-002", "Potential infinite loop", "A constant loop condition can prevent termination.", "while (true)", "Use a terminating condition or an explicit, bounded break.");
    }
    if (node.type === "ForStatement" && node.test === null) {
      runtime(node, "BUGAI-RUN-002", "Potential infinite loop", "A constant loop condition can prevent termination.", "for (;;)", "Use a terminating condition or an explicit, bounded break.");
    }

    // BUGAI-RUN-003 — dereferencing a null-like literal.
    if (node.type === "MemberExpression" && (node.object.type === "NullLiteral" || (node.object.type === "Identifier" && node.object.name === "undefined"))) {
      runtime(node, "BUGAI-RUN-003", "Immediate null dereference", "A null-like literal is dereferenced.", node.object.type === "NullLiteral" ? "null" : "undefined", "Check or initialise the value before access.");
    }

    // BUGAI-RUN-004 — assignment where a comparison was almost certainly meant.
    if ((node.type === "IfStatement" || node.type === "WhileStatement" || node.type === "DoWhileStatement") &&
        node.test.type === "AssignmentExpression" && node.test.operator === "=") {
      runtime(node, "BUGAI-RUN-004", "Assignment used as a condition", "A single '=' assignment appears where a comparison was likely intended.", "= used in condition", "Use '===' for comparison, or wrap the assignment in extra parentheses if it is intentional.");
    }
  });

  return results;
}
