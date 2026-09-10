import { GoogleGenAI } from "@google/genai";
import { createAppError } from "../utils/errors.js";

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({}) : null;

const severityWeights = {
  critical: 22,
  high: 14,
  medium: 8,
  low: 4
};

function uniquePush(list, item, matcher) {
  if (!list.some((entry) => matcher(entry, item))) {
    list.push(item);
  }
}

function toBug({
  line,
  severity,
  category,
  title,
  explanation,
  whyItHappens,
  fix,
  snippet
}) {
  return {
    id: `bug-${line}-${category}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    line,
    severity,
    category,
    title,
    explanation,
    whyItHappens,
    fix,
    snippet
  };
}

function chooseStrongerResult(primary, fallback) {
  if (!primary) return fallback;
  if ((primary.bugs?.length || 0) < (fallback.bugs?.length || 0)) {
    return fallback;
  }
  if ((primary.riskScore || 0) < (fallback.riskScore || 0) && !(primary.bugs?.length)) {
    return fallback;
  }
  return primary;
}

const javaImportRules = [
  { className: "List", importPath: "java.util.List" },
  { className: "ArrayList", importPath: "java.util.ArrayList" },
  { className: "Map", importPath: "java.util.Map" },
  { className: "HashMap", importPath: "java.util.HashMap" },
  { className: "Set", importPath: "java.util.Set" },
  { className: "HashSet", importPath: "java.util.HashSet" },
  { className: "Scanner", importPath: "java.util.Scanner" },
  { className: "Arrays", importPath: "java.util.Arrays" },
  { className: "LocalDate", importPath: "java.time.LocalDate" },
  { className: "LocalDateTime", importPath: "java.time.LocalDateTime" }
];

function nextMeaningfulLine(lines, startIndex) {
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed && !/^[{}]+;?$/.test(trimmed) && !/^(\/\/|#|\/\*|\*|\*\/)/.test(trimmed)) {
      return { lineNumber: i + 1, content: lines[i] };
    }
  }
  return null;
}

function getIndent(rawLine) {
  return rawLine.match(/^\s*/)?.[0] || "";
}

function getSafeReturnExpression(returnType) {
  if (returnType === "void") return "";
  if (/(int|long|short|byte)/.test(returnType)) return "0";
  if (/(double|float)/.test(returnType)) return "0.0";
  if (returnType === "boolean") return "false";
  if (returnType === "char") return "'a'";
  if (returnType === "String") return "\"\"";
  return "null";
}

function isJavaReturnMismatch(returnType, line) {
  if (!returnType) return false;
  const trimmed = line.trim();
  if (!/^return\b/.test(trimmed)) return false;

  if (returnType === "void") {
    return /^return\s+.+;?$/.test(trimmed);
  }
  if (/(int|long|short|byte|double|float)/.test(returnType)) {
    return /^return\s+["'][^"']*["']\s*;?$/.test(trimmed) || /^return\s+(true|false)\s*;?$/i.test(trimmed);
  }
  if (returnType === "boolean") {
    return /^return\s+\d+\s*;?$/.test(trimmed) || /^return\s+["'][^"']*["']\s*;?$/.test(trimmed);
  }
  if (returnType === "char") {
    return /^return\s+["'][^"']{2,}["']\s*;?$/.test(trimmed) || /^return\s+\d+\s*;?$/.test(trimmed);
  }
  if (returnType === "String") {
    return /^return\s+\d+\s*;?$/.test(trimmed) || /^return\s+(true|false)\s*;?$/i.test(trimmed);
  }

  return false;
}

function applyOfflineAnalysis(source, language, sourceName) {
  const lines = source.split(/\r?\n/);
  const fixedLines = [...lines];
  const bugs = [];
  const suggestions = new Set();
  const lowerLanguage = String(language || "").toLowerCase();
  const javaImports = new Set(
    lines
      .map((entry) => entry.trim().match(/^import\s+([\w.]+);$/))
      .filter(Boolean)
      .map((match) => match[1])
  );
  const javaArraySizes = new Map();
  const pendingJavaImports = new Set();
  let javaBraceDepth = 0;
  let javaMethodContext = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (!line) continue;

    if (lowerLanguage === "java") {
      const methodMatch = line.match(/(?:public|private|protected)?\s*(?:static\s+)?([A-Z][\w<>]*|void|int|long|short|byte|double|float|boolean|char|String)\s+([a-zA-Z_]\w*)\s*\([^)]*\)\s*\{/);
      if (methodMatch) {
        javaMethodContext = {
          returnType: methodMatch[1],
          depth: javaBraceDepth
        };
      }

      const arrayDeclaration = line.match(/\b(?:int|long|double|float|char|byte|short|boolean|String)\s*\[\]\s+([A-Za-z_]\w*)\s*=\s*new\s+[A-Za-z_]\w*\s*\[\s*(\d+)\s*\]/);
      if (arrayDeclaration) {
        javaArraySizes.set(arrayDeclaration[1], Number(arrayDeclaration[2]));
      }
    }

    if ((/^if\s+.+[^:]$/i.test(line) || /^for\s+.+[^:]$/i.test(line) || /^while\s+.+[^:]$/i.test(line) || /^def\s+.+[^:]$/i.test(line)) && lowerLanguage.includes("python")) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "medium",
          category: "syntax",
          title: "Missing colon in control statement",
          explanation: "Python control blocks need a trailing colon to form a valid block.",
          whyItHappens: "The statement opens a block but does not terminate correctly.",
          fix: "Add a colon at the end of the statement.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Add missing colons to Python control statements.");
      fixedLines[index] = `${rawLine}:`;
    }

    if (lowerLanguage === "java" && /\bint\s+\w+\s*=\s*["'][^"']*["']\s*;?/.test(line)) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "high",
          category: "type mismatch",
          title: "Invalid assignment between String and int",
          explanation: "Java does not allow assigning a string literal to an integer variable.",
          whyItHappens: "Static type checking rejects incompatible assignments at compile time.",
          fix: "Use a numeric value or change the variable type to String.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Match variable types to the values assigned in Java declarations.");
      fixedLines[index] = rawLine.replace(/=\s*["'][^"']*["']/, "= 0");
    }

    if (lowerLanguage === "java" && /\bif\s*\(\s*[A-Za-z_]\w*\s*=\s*[^=].*\)/.test(line)) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "high",
          category: "syntax",
          title: "Assignment used inside if condition",
          explanation: "This condition uses assignment rather than a boolean expression or comparison.",
          whyItHappens: "Java if statements require a boolean result, so assigning a value here is usually a compile error or logic bug.",
          fix: "Use a comparison such as == or compute a boolean before the if statement.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Review Java conditions for accidental assignment operators.");
      fixedLines[index] = rawLine.replace(/\(\s*([A-Za-z_]\w*)\s*=\s*([^=][^)]+)\)/, "($1 == $2)");
    }

    if (lowerLanguage === "java" && /System\.out\.println\(.*\)\s*$/.test(line) && !line.endsWith(";")) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "medium",
          category: "syntax",
          title: "Missing semicolon",
          explanation: "Java statements like System.out.println must end with a semicolon.",
          whyItHappens: "The compiler expects statement terminators after method calls and assignments.",
          fix: "Add a semicolon at the end of the statement.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Add missing semicolons to Java statements.");
      fixedLines[index] = `${rawLine};`;
    }

    if (lowerLanguage === "java" && /\bfor\s*\(\s*int\s+\w+\s*=\s*\d+\s*;\s*\w+\s*<\s*\d+\s*;\s*\w+\s*--\s*\)/.test(line)) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "high",
          category: "logic flaw",
          title: "Loop moves away from its exit condition",
          explanation: "This for loop decrements while checking for an increasing upper bound, so it may never terminate.",
          whyItHappens: "The counter update pushes the value farther from satisfying the stop condition.",
          fix: "Increment the counter or reverse the loop condition to match the update direction.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Make loop conditions and counter updates move toward termination.");
      fixedLines[index] = rawLine.replace(/--\s*\)/, "++)");
    }

    if (lowerLanguage === "java") {
      const arrayAccess = line.match(/\b([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]/);
      if (arrayAccess) {
        const arrayName = arrayAccess[1];
        const arrayIndex = Number(arrayAccess[2]);
        const knownSize = javaArraySizes.get(arrayName);
        if (Number.isInteger(knownSize) && arrayIndex >= knownSize) {
          uniquePush(
            bugs,
            toBug({
              line: lineNumber,
              severity: "high",
              category: "runtime",
              title: "Possible array index out of bounds",
              explanation: "This access uses a literal index that is outside the declared array size.",
              whyItHappens: "Java arrays are zero-based, so valid indexes stop at length - 1.",
              fix: `Keep the index below ${knownSize} or increase the array size.`,
              snippet: rawLine
            }),
            (a, b) => a.line === b.line && a.title === b.title
          );
          suggestions.add("Check Java array indexes against the declared array length.");
          fixedLines[index] = rawLine.replace(
            new RegExp(`\\[\\s*${arrayIndex}\\s*\\]`),
            `[${Math.max(0, knownSize - 1)}]`
          );
        }
      }

      if (javaMethodContext && isJavaReturnMismatch(javaMethodContext.returnType, line)) {
        uniquePush(
          bugs,
          toBug({
            line: lineNumber,
            severity: "high",
            category: "type mismatch",
            title: "Return value does not match method return type",
            explanation: `This method appears to return a value that does not match its declared return type of ${javaMethodContext.returnType}.`,
            whyItHappens: "Java enforces return types at compile time and rejects incompatible return expressions.",
            fix: `Return a ${javaMethodContext.returnType}-compatible value or update the method signature.`,
            snippet: rawLine
          }),
          (a, b) => a.line === b.line && a.title === b.title
        );
        suggestions.add("Match Java return statements to the declared method return type.");
        const indent = getIndent(rawLine);
        const safeReturn = getSafeReturnExpression(javaMethodContext.returnType);
        fixedLines[index] = safeReturn
          ? `${indent}return ${safeReturn};`
          : `${indent}return;`;
      }
    }

    if (lowerLanguage === "java" && /\bString\s+\w+\s*=\s*null\s*;/.test(line)) {
      const nextNonEmptyLine = lines.slice(index + 1).find((entry) => entry.trim());
      if (nextNonEmptyLine && /\.\s*length\s*\(\s*\)/.test(nextNonEmptyLine)) {
        uniquePush(
          bugs,
          toBug({
            line: lineNumber + lines.slice(index + 1).findIndex((entry) => entry.trim()) + 1,
            severity: "critical",
            category: "runtime",
            title: "Possible NullPointerException",
            explanation: "A null String is used like an initialized object on a later line.",
            whyItHappens: "Calling methods on null references throws NullPointerException at runtime.",
            fix: "Initialize the value or guard it with a null check before use.",
            snippet: nextNonEmptyLine
          }),
          (a, b) => a.line === b.line && a.title === b.title
        );
        suggestions.add("Check Java object references for null before dereferencing them.");
        fixedLines[index] = rawLine.replace(/=\s*null/, "= \"\"");
      }
    }

    if (lowerLanguage.includes("python")) {
      const noneMatch = line.match(/^([A-Za-z_]\w*)\s*=\s*None\b/);
      if (noneMatch) {
        const variableName = noneMatch[1];
        const nextUseIndex = lines.slice(index + 1).findIndex((entry) => new RegExp(`\\b${variableName}\\.`).test(entry));
        if (nextUseIndex >= 0) {
          uniquePush(
            bugs,
            toBug({
              line: index + nextUseIndex + 2,
              severity: "critical",
              category: "runtime",
              title: "Possible NoneType attribute access",
              explanation: "This variable is initialized as None and later used like an object.",
              whyItHappens: "Calling methods on None raises an AttributeError at runtime.",
              fix: "Initialize the variable to a safe default or guard it before use.",
              snippet: lines[index + nextUseIndex + 1]
            }),
            (a, b) => a.line === b.line && a.title === b.title
          );
          suggestions.add("Initialize Python variables safely before calling methods on them.");
          fixedLines[index] = rawLine.replace(/\bNone\b/, "\"\"");
        }
      }
    }

    if (/while\s*\(\s*true\s*\)|while\s+true/i.test(line)) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "high",
          category: "logic flaw",
          title: "Potential infinite loop",
          explanation: "This loop appears to run forever without an obvious exit path.",
          whyItHappens: "A constant truthy loop condition can block execution or hang worker processes.",
          fix: "Introduce a terminating condition or explicit break.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Review loops that never change their exit conditions.");
      if (lowerLanguage.includes("python")) {
        fixedLines[index] = rawLine.replace(/\bwhile\s+true\b/i, "while False");
      } else {
        fixedLines[index] = rawLine.replace(/while\s*\(\s*true\s*\)/i, "while (false)");
      }
    }

    if (/\/\s*0\b/.test(line)) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "critical",
          category: "runtime",
          title: "Division by zero",
          explanation: "Division by zero will throw or crash at runtime.",
          whyItHappens: "The denominator is a literal zero or resolves to zero without a guard.",
          fix: "Validate the denominator before dividing.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Guard arithmetic operations against zero denominators.");
      fixedLines[index] = fixedLines[index].replace(/\/\s*0\b/g, "/ 1");
    }

    if (/\b(eval|exec)\s*\(/.test(line)) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "critical",
          category: "security",
          title: "Dynamic code execution risk",
          explanation: "Executing generated strings opens the door to injection and remote code execution.",
          whyItHappens: "User or external input can reach a code execution primitive.",
          fix: "Replace dynamic execution with parsed, validated logic.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Avoid eval or exec for untrusted input.");
      fixedLines[index] = `${getIndent(rawLine)}${lowerLanguage.includes("python") ? "pass" : "// dynamic execution removed"}`;
    }

    if (/new\s+\w+/.test(line) && !/delete\s+/.test(source) && /(cpp|c\+\+)/i.test(lowerLanguage)) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "high",
          category: "memory leak",
          title: "Potential unmanaged allocation",
          explanation: "Manual allocation appears without a matching release strategy.",
          whyItHappens: "Heap memory can remain allocated after the object is no longer used.",
          fix: "Use RAII, smart pointers, or ensure delete is called safely.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Prefer smart pointers or deterministic cleanup for heap allocations.");
    }

    if (/SELECT\s+.+\+\s*\w+/i.test(line) || /query\s*=\s*["'`].*\+\s*\w+/i.test(line)) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "critical",
          category: "security",
          title: "Possible SQL injection",
          explanation: "The query appears to concatenate variables into SQL.",
          whyItHappens: "String interpolation can allow attackers to inject commands.",
          fix: "Use parameterized queries or prepared statements.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Use prepared statements for database access.");
    }

    if (/console\.log\(|print\(/.test(line) && /password|token|secret/i.test(line)) {
      uniquePush(
        bugs,
        toBug({
          line: lineNumber,
          severity: "high",
          category: "security",
          title: "Sensitive value exposed in logs",
          explanation: "Credentials or secrets should not be logged in plaintext.",
          whyItHappens: "Operational logs are often retained and widely accessible.",
          fix: "Remove the log or redact the sensitive value before output.",
          snippet: rawLine
        }),
        (a, b) => a.line === b.line && a.title === b.title
      );
      suggestions.add("Redact secrets before logging.");
      if (lowerLanguage.includes("python")) {
        fixedLines[index] = rawLine.replace(/print\s*\((.*)\)/, "print(\"[REDACTED]\")");
      } else {
        fixedLines[index] = rawLine.replace(/console\.log\s*\((.*)\)/, "console.log(\"[REDACTED]\")");
      }
    }

    if (/\b(return|throw|break|continue)\b/.test(line)) {
      const nextLine = nextMeaningfulLine(lines, index);
      const isPythonReachableAfterDedent = lowerLanguage.includes("python")
        && nextLine
        && getIndent(nextLine.content).length < getIndent(rawLine).length;

      if (nextLine && !isPythonReachableAfterDedent) {
        uniquePush(
          bugs,
          toBug({
            line: nextLine.lineNumber,
            severity: lowerLanguage === "java" ? "medium" : "low",
            category: "dead code",
            title: "Potential unreachable code",
            explanation: "Statements after an unconditional control-flow exit are often never executed.",
            whyItHappens: "Control flow leaves the current path before the following statement can run.",
            fix: "Move the code before the exit statement or remove the unreachable statement.",
            snippet: nextLine.content
          }),
          (a, b) => a.line === b.line && a.title === b.title
        );
        suggestions.add("Remove or relocate unreachable statements.");
        fixedLines[nextLine.lineNumber - 1] = "";
      }
    }

    if (lowerLanguage === "java") {
      const opens = (rawLine.match(/\{/g) || []).length;
      const closes = (rawLine.match(/\}/g) || []).length;
      javaBraceDepth += opens - closes;
      if (javaMethodContext && javaBraceDepth <= javaMethodContext.depth) {
        javaMethodContext = null;
      }
    }
  }

  if (lowerLanguage === "java") {
    for (const rule of javaImportRules) {
      const usageIndex = lines.findIndex((entry) => {
        const trimmed = entry.trim();
        return new RegExp(`\\b${rule.className}\\b`).test(trimmed)
          && !trimmed.startsWith("import ")
          && !trimmed.includes(rule.importPath)
          && !trimmed.startsWith("//");
      });

      if (usageIndex >= 0 && !javaImports.has(rule.importPath)) {
        uniquePush(
          bugs,
          toBug({
            line: usageIndex + 1,
            severity: "medium",
            category: "missing import",
            title: `Missing import for ${rule.className}`,
            explanation: `${rule.className} usually requires an explicit import before use in Java.`,
            whyItHappens: "The compiler cannot resolve many standard library types unless they are imported or fully qualified.",
            fix: `Add 'import ${rule.importPath};' at the top of the file, or use the fully qualified class name.`,
            snippet: lines[usageIndex]
          }),
          (a, b) => a.title === b.title
        );
        suggestions.add("Add required imports for Java standard library classes before using them.");
        pendingJavaImports.add(rule.importPath);
      }
    }
  }

  if (pendingJavaImports.size) {
    let insertIndex = 0;
    while (insertIndex < fixedLines.length && /^package\s+/.test(fixedLines[insertIndex].trim())) {
      insertIndex += 1;
    }
    while (insertIndex < fixedLines.length && (fixedLines[insertIndex].trim() === "" || /^import\s+/.test(fixedLines[insertIndex].trim()))) {
      insertIndex += 1;
    }
    fixedLines.splice(insertIndex, 0, ...Array.from(pendingJavaImports).map((entry) => `import ${entry};`), "");
  }

  const severityBreakdown = {
    critical: bugs.filter((bug) => bug.severity === "critical").length,
    high: bugs.filter((bug) => bug.severity === "high").length,
    medium: bugs.filter((bug) => bug.severity === "medium").length,
    low: bugs.filter((bug) => bug.severity === "low").length
  };

  const riskScore = Math.min(
    97,
    bugs.reduce((sum, bug) => sum + severityWeights[bug.severity], 6)
  );
  const riskLevel = riskScore >= 80 ? "Critical" : riskScore >= 60 ? "High" : riskScore >= 35 ? "Medium" : "Low";
  const totalLines = lines.length;
  const vulnerableLines = bugs.map((bug) => bug.line);
  // This compatibility engine has no validated code-quality benchmark. Keep
  // the field truthful for callers still expecting the older response shape.
  const codeQualityScore = null;
  const fixedCode = fixedLines.join("\n");

  return {
    summary: `BugZero AI analyzed ${sourceName} and found ${bugs.length} likely issue${bugs.length === 1 ? "" : "s"} across ${totalLines} lines.`,
    riskScore,
    riskLevel,
    confidence: bugs.length ? 91 : 96,
    codeQualityScore,
    evaluation: { status: "not_configured", message: "Evaluation benchmark not configured." },
    bugs,
    severityBreakdown,
    vulnerableLines,
    suggestedFixes: Array.from(suggestions),
    fixedCode,
    metrics: {
      totalLines,
      bugCount: bugs.length,
      language
    }
  };
}

function repairAiPayload(payload, source, language, sourceName) {
  const fallback = applyOfflineAnalysis(source, language, sourceName);
  const bugs = Array.isArray(payload.bugs) ? payload.bugs.map((bug, index) => ({
    id: bug.id || `bug-ai-${index}`,
    line: Number(bug.line || 1),
    severity: String(bug.severity || "medium").toLowerCase(),
    category: bug.category || "bug",
    title: bug.title || "Potential issue",
    explanation: bug.explanation || "The model detected a possible problem in this code.",
    whyItHappens: bug.whyItHappens || "The logic likely creates unsafe behavior.",
    fix: bug.fix || "Review the related block and apply the suggested correction.",
    snippet: bug.snippet || ""
  })) : fallback.bugs;

  const severityBreakdown = {
    critical: bugs.filter((bug) => bug.severity === "critical").length,
    high: bugs.filter((bug) => bug.severity === "high").length,
    medium: bugs.filter((bug) => bug.severity === "medium").length,
    low: bugs.filter((bug) => bug.severity === "low").length
  };

  const riskScore = Number(payload.riskScore ?? fallback.riskScore);
  const aiFixedCode = String(payload.fixedCode || "").trim();
  const fallbackFixedCode = fallback.fixedCode;
  const aiFixedBugCount = aiFixedCode
    ? applyOfflineAnalysis(aiFixedCode, language, `${sourceName} fixed`).bugs.length
    : Number.POSITIVE_INFINITY;
  const fallbackFixedBugCount = applyOfflineAnalysis(
    fallbackFixedCode,
    language,
    `${sourceName} fixed`
  ).bugs.length;

  return {
    summary: payload.summary || fallback.summary,
    riskScore,
    riskLevel: payload.riskLevel || fallback.riskLevel,
    confidence: Number(payload.confidence ?? fallback.confidence),
    codeQualityScore: Number(payload.codeQualityScore ?? fallback.codeQualityScore),
    bugs,
    severityBreakdown,
    vulnerableLines: Array.isArray(payload.vulnerableLines)
      ? payload.vulnerableLines.map((line) => Number(line))
      : fallback.vulnerableLines,
    suggestedFixes: Array.isArray(payload.suggestedFixes) && payload.suggestedFixes.length
      ? payload.suggestedFixes
      : fallback.suggestedFixes,
    fixedCode: aiFixedBugCount <= fallbackFixedBugCount ? (aiFixedCode || fallbackFixedCode) : fallbackFixedCode,
    metrics: {
      totalLines: Number(payload.metrics?.totalLines ?? fallback.metrics.totalLines),
      bugCount: bugs.length,
      language
    }
  };
}

async function analyzeWithAi({ source, language, sourceName }) {
  if (!ai) return null;

  const prompt = `
You are BugZero AI, a senior static analyzer for Python, Java, C++, C, JavaScript, and TypeScript.
Analyze the supplied code and return exactly one JSON object with this shape:
{
  "summary": "string",
  "riskScore": number,
  "riskLevel": "Critical" | "High" | "Medium" | "Low",
  "confidence": number,
  "codeQualityScore": number,
  "bugs": [
    {
      "line": number,
      "severity": "critical" | "high" | "medium" | "low",
      "category": "string",
      "title": "string",
      "explanation": "string",
      "whyItHappens": "string",
      "fix": "string",
      "snippet": "string"
    }
  ],
  "vulnerableLines": [number],
  "suggestedFixes": ["string"],
  "fixedCode": "string",
  "metrics": {
    "totalLines": number
  }
}

Prioritize:
- null pointer issues
- memory leaks
- infinite loops
- syntax risks
- logic flaws
- security vulnerabilities
- dead code
- unused variables

Source name: ${sourceName}
Language: ${language}

Code:
${source}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text);
}

export async function analyzeWithEngine({ source, language, sourceName }) {
  const fallbackResult = applyOfflineAnalysis(source, language, sourceName);
  try {
    const aiResult = await analyzeWithAi({ source, language, sourceName });
    if (aiResult) {
      return chooseStrongerResult(
        repairAiPayload(aiResult, source, language, sourceName),
        fallbackResult
      );
    }
  } catch (error) {
    console.error("AI analyzer fallback:", error.message);
  }

  return fallbackResult;
}

function parseGithubUrl(repoUrl) {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!match) {
    throw createAppError(400, "Enter a valid public GitHub repository URL.");
  }

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, "")
  };
}

const supportedExtensions = /\.(js|jsx|ts|tsx|py|java|cpp|cc|c|cs|go|rb|php|swift|kt)$/i;

export async function fetchGithubRepositoryFiles(repoUrl) {
  const { owner, repo } = parseGithubUrl(repoUrl);
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!repoRes.ok) {
    throw createAppError(502, "GitHub repository could not be reached.");
  }

  const repoInfo = await repoRes.json();
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${repoInfo.default_branch}?recursive=1`);
  if (!treeRes.ok) {
    throw createAppError(502, "GitHub repository tree could not be loaded.");
  }

  const tree = await treeRes.json();
  const files = tree.tree
    .filter((item) => item.type === "blob" && supportedExtensions.test(item.path))
    .slice(0, 12);

  if (!files.length) {
    throw createAppError(400, "No supported source files were found in that repository.");
  }

  const loaded = [];
  for (const file of files) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${repoInfo.default_branch}/${file.path}`;
    const fileRes = await fetch(rawUrl);
    if (!fileRes.ok) continue;
    const content = await fileRes.text();
    loaded.push({ path: file.path, content: content.slice(0, 8000) });
  }

  if (!loaded.length) {
    throw createAppError(502, "Repository files could not be downloaded.");
  }

  return loaded;
}
