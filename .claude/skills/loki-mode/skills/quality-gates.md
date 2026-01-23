# Quality Gates

**Never ship code without passing all quality gates.**

## The 7 Quality Gates

1. **Input Guardrails** - Validate scope, detect injection, check constraints (OpenAI SDK)
2. **Static Analysis** - CodeQL, ESLint/Pylint, type checking
3. **Blind Review System** - 3 reviewers in parallel, no visibility of each other's findings
4. **Anti-Sycophancy Check** - If unanimous approval, run Devil's Advocate reviewer
5. **Output Guardrails** - Validate code quality, spec compliance, no secrets (tripwire on fail)
6. **Severity-Based Blocking** - Critical/High/Medium = BLOCK; Low/Cosmetic = TODO comment
7. **Test Coverage Gates** - Unit: 100% pass, >80% coverage; Integration: 100% pass

## Guardrails Execution Modes

- **Blocking**: Guardrail completes before agent starts (use for expensive operations)
- **Parallel**: Guardrail runs with agent (use for fast checks, accept token loss risk)

**Research:** Blind review + Devil's Advocate reduces false positives by 30% (CONSENSAGENT, 2025)

---

## Velocity-Quality Feedback Loop (CRITICAL)

**Research from arXiv 2511.04427v2 - empirical study of 807 repositories.**

### Key Findings

| Metric | Finding | Implication |
|--------|---------|-------------|
| Initial Velocity | +281% lines added | Impressive but TRANSIENT |
| Quality Degradation | +30% static warnings, +41% complexity | PERSISTENT problem |
| Cancellation Point | 3.28x complexity OR 4.94x warnings | Completely negates velocity gains |

### The Trap to Avoid

```
Initial excitement -> Velocity spike -> Quality degradation accumulates
                                               |
                                               v
                               Complexity cancels velocity gains
                                               |
                                               v
                               Frustration -> Abandonment cycle
```

**CRITICAL RULE:** Every velocity gain MUST be accompanied by quality verification.

### Mandatory Quality Checks (Per Task)

```yaml
velocity_quality_balance:
  before_commit:
    - static_analysis: "Run ESLint/Pylint/CodeQL - warnings must not increase"
    - complexity_check: "Cyclomatic complexity must not increase >10%"
    - test_coverage: "Coverage must not decrease"

  thresholds:
    max_new_warnings: 0  # Zero tolerance for new warnings
    max_complexity_increase: 10%  # Per file, per commit
    min_coverage: 80%  # Never drop below

  if_threshold_violated:
    action: "BLOCK commit, fix before proceeding"
    reason: "Velocity gains without quality are net negative"
```

### Metrics to Track

```
.loki/metrics/quality/
+-- warnings.json      # Static analysis warning count over time
+-- complexity.json    # Cyclomatic complexity per file
+-- coverage.json      # Test coverage percentage
+-- velocity.json      # Lines added/commits per hour
+-- ratio.json         # Quality/Velocity ratio (must stay positive)
```

---

## Blind Review System

**Launch 3 reviewers in parallel in a single message:**

```python
# ALWAYS launch all 3 in ONE message
Task(model="sonnet", description="Code review: correctness", prompt="Review for bugs...")
Task(model="sonnet", description="Code review: security", prompt="Review for vulnerabilities...")
Task(model="sonnet", description="Code review: performance", prompt="Review for efficiency...")
```

**Rules:**
- ALWAYS use sonnet for reviews (balanced quality/cost)
- NEVER aggregate before all 3 complete
- ALWAYS re-run ALL 3 after fixes
- If unanimous approval -> run Devil's Advocate

---

## Severity-Based Blocking

| Severity | Action |
|----------|--------|
| Critical | BLOCK - fix immediately |
| High | BLOCK - fix before commit |
| Medium | BLOCK - fix before merge |
| Low | TODO comment, fix later |
| Cosmetic | Note, optional fix |

See `references/quality-control.md` for complete details.

---

## Scale Considerations

> **Source:** [Cursor Scaling Learnings](../references/cursor-learnings.md) - integrators became bottlenecks at 100+ agents

### Review Intensity Scaling

At high agent counts, full 3-reviewer blind review for every change creates bottlenecks.

```yaml
review_scaling:
  low_scale:  # <10 agents
    all_changes: "Full 3-reviewer blind review"
    rationale: "Quality critical, throughput acceptable"

  medium_scale:  # 10-50 agents
    high_risk: "Full 3-reviewer blind review"
    medium_risk: "2-reviewer review"
    low_risk: "1 reviewer + automated checks"
    rationale: "Balance quality and throughput"

  high_scale:  # 50+ agents
    critical_changes: "Full 3-reviewer blind review"
    standard_changes: "Automated checks + spot review"
    trivial_changes: "Automated checks only"
    rationale: "Trust workers, avoid bottlenecks"

risk_classification:
  high_risk:
    - Security-related changes
    - Authentication/authorization
    - Payment processing
    - Data migrations
    - API breaking changes
  medium_risk:
    - New features
    - Business logic changes
    - Database schema changes
  low_risk:
    - Bug fixes with tests
    - Refactoring with no behavior change
    - Documentation
    - Dependency updates (minor)
```

### Judge Agent Integration

Use judge agents to determine when full review is needed:

```yaml
judge_review_decision:
  inputs:
    - change_type: "feature|bugfix|refactor|docs"
    - files_changed: 5
    - lines_changed: 120
    - test_coverage: 85%
    - static_analysis: "0 new warnings"
  output:
    review_level: "full|partial|automated"
    rationale: "Medium-risk feature with good coverage"
```

### Cursor's Key Learning

> "Dedicated integrator/reviewer roles created more bottlenecks than they solved. Workers were already capable of handling conflicts themselves."

**Implication:** At scale, trust automated checks and worker judgment. Reserve full review for high-risk changes only.
