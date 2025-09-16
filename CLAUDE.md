# CLAUDE.md — Personal Global Guide

## Philosophy
* **Small, safe steps** → incremental progress with tests and rollback plans
* **Clarity > cleverness** → boring, obvious code that survives team changes
* **Pragmatic, not dogmatic** → adapt to reality, break rules when justified
* **Simplicity** → one responsibility per unit, no premature abstractions
* **Systems thinking** → optimize for the whole, not just the part

## Process

### Planning & Staging
* Break work into **3–5 stages** in `IMPLEMENTATION_PLAN.md`
* Each stage defines: Goal, Context, Success Criteria, Key Files, Dependencies, Tests, Rollback Plan, Status
* Add **Claude Notes**: patterns to follow, utilities to reuse, pitfalls to avoid, team conventions
* Include **Stakeholder Checkpoints**: when to sync with product/design/leadership

### Implementation Flow
1. **Study** existing code/tests and system architecture
2. **Define** test scenarios in plain language with business context
3. **Write** failing test (red) with clear assertions
4. **Implement** minimal code (green) with error boundaries
5. **Validate** coverage and performance impact
6. **Refactor** with monitoring hooks
7. **Deploy** incrementally with feature flags
8. **Commit** with context and impact summary

### Stuck Rule (3 Attempts Max)
* **Document**: error, context, root cause analysis
* **Research**: patterns, libraries, architectural alternatives
* **Escalate**: team knowledge, external resources, pair programming
* **Pivot**: try manual approach, simplify scope, or defer complexity
* **Learn**: capture lessons in team knowledge base

### Emergency Protocol
**When to break the rules:**
* Production outage with customer impact
* Security vulnerability requiring immediate patch
* Legal/compliance deadline with business risk

**How to break safely:**
* Document the deviation and timeline for remediation
* Create technical debt tickets with priority
* Notify team of temporary state
* Plan cleanup in next sprint

## QA & Testing

### Test Pyramid
* **Unit** (70%): isolated behavior, fast feedback
* **Integration** (20%): component interactions, contracts
* **E2E** (10%): critical user workflows, smoke tests

### Test Types
* **API**: contracts, error handling, rate limiting
* **Performance**: load testing, memory profiling, latency SLAs
* **Security**: input validation, authentication, authorization
* **Accessibility**: screen readers, keyboard navigation, color contrast
* **Chaos**: failure scenarios, network partitions, data corruption

**Principles**
* Test behavior, not implementation details
* Clear, deterministic tests with isolated data
* Acceptance criteria → failing test → minimal fix → refactor
* Cover happy path, edge cases, and failure modes
* Maintain test performance (no flaky tests tolerated)

## Technical Standards

### Architecture
* **Composition > inheritance** with clear interfaces
* **Explicit data flow** with immutable boundaries
* **Dependency injection** over singletons or globals
* **Event-driven** for loose coupling
* **Observability-first** with metrics, logs, traces

### Code Quality
* Every commit compiles, passes tests, follows conventions
* Commit messages explain **why** with business context
* **Fail fast** with actionable error messages
* **Never swallow errors** - log, monitor, alert
* **Configuration as code** with environment parity

### Performance & Reliability
* **Graceful degradation** when dependencies fail
* **Circuit breakers** for external service calls
* **Caching strategies** with invalidation plans
* **Database migrations** with rollback scripts
* **Monitoring dashboards** for key business metrics

## Quality Gates

### Done (Development)
* ✅ Tests pass with >80% coverage on new code
* ✅ Conventions followed (linting, formatting, naming)
* ✅ No security vulnerabilities in dependencies
* ✅ Performance benchmarks within SLA
* ✅ Documentation updated (API, architecture decisions)
* ✅ Feature flags configured for gradual rollout

### Done (QA)
* ✅ User scenarios validated end-to-end
* ✅ Edge cases and error conditions tested
* ✅ Cross-browser/device compatibility verified
* ✅ Accessibility audit completed
* ✅ Load testing results within targets
* ✅ Security review approved

### Done (Production)
* ✅ Monitoring alerts configured
* ✅ Rollback procedure documented and tested
* ✅ Team runbook updated
* ✅ Stakeholders notified of changes
* ✅ Metrics dashboard shows healthy baselines

## CI/CD Discipline

### Pipeline Stages
1. **Fast feedback** (< 5min): unit tests, linting, security scan
2. **Integration** (< 15min): API tests, database migrations
3. **Pre-production** (< 30min): E2E tests, performance validation
4. **Deployment** (< 10min): blue-green deploy with health checks
5. **Post-deploy** (ongoing): synthetic monitoring, user analytics

### Pipeline Health
* **Zero tolerance** for broken main branch
* **Flaky test quarantine** → fix within 2 sprints or delete
* **Performance regression detection** with automatic rollback
* **Security scanning** on every dependency change
* **Deployment frequency** as a team health metric

## Decision Framework

### Technical Decisions
1. **Risk assessment**: what could go wrong?
2. **Cost analysis**: development + maintenance + opportunity
3. **Testability**: can we validate it works?
4. **Readability**: will the team understand this in 6 months?
5. **Consistency**: does it fit our patterns?
6. **Business impact**: does it move key metrics?
7. **Reversibility**: can we undo this decision?

### Architectural Decisions
* Document in **Architecture Decision Records (ADRs)**
* Include: context, options considered, decision, consequences
* Review quarterly for relevance
* Share with broader engineering org for consistency

## Stakeholder Management

### Communication Cadence
* **Daily**: team standup with blockers and progress
* **Weekly**: stakeholder sync with demo and metrics
* **Sprint**: retrospective with improvement actions
* **Monthly**: architecture review and technical debt assessment

### Managing Pressure
* **Scope negotiation**: what can we defer without breaking the user experience?
* **Technical debt transparency**: communicate the cost of shortcuts
* **Alternative solutions**: present options with trade-offs
* **Timeline realism**: buffer estimates for unknowns and integration

## Working with Claude

### Always Provide
* Current stage from `IMPLEMENTATION_PLAN.md`
* Relevant code/tests (focused, not entire repo)
* Exact error messages with full stack traces
* System context (OS, versions, environment)
* Business requirements and constraints

### Session Management
```
Project: [Name]
Stage: [X/Y] [Current stage name]
Progress: [Last completed milestone]
Next: [Immediate 1-3 tasks]
Files: [Currently active files]
Blockers: [Technical/business issues]
Context: [Key decisions/constraints]
```

### Optimization Tips
* **Refresh context** every 10–15 turns or when switching focus
* **Use specific examples** rather than abstract requirements
* **Ask for alternatives** when stuck on implementation
* **Validate assumptions** about system behavior
* **Request code reviews** for critical changes

## Team Scaling

### Knowledge Management
* **Runbooks** for operational procedures
* **Decision logs** for why choices were made
* **Code review checklists** for consistency
* **Onboarding guides** for new team members
* **Post-mortem templates** for learning from incidents

### Collaboration Patterns
* **Pair programming** for knowledge transfer and complex problems
* **Code reviews** focus on maintainability and business logic
* **Architecture reviews** for cross-team impact
* **Lunch-and-learns** for sharing discoveries and tools

## Rules of Engagement

### NEVER
* Bypass quality gates under pressure (`--no-verify`, skipping tests)
* Disable monitoring/alerts instead of fixing root causes
* Commit credentials, API keys, or sensitive data
* Deploy on Fridays without executive approval
* Make database changes without migration scripts and rollbacks

### ALWAYS
* Work incrementally with feature flags
* Update documentation with code changes
* Stop after 3 failed attempts and ask for help
* Validate changes in production-like environment
* Consider the maintenance burden of new dependencies
* Communicate breaking changes well in advance

### EMERGENCY OVERRIDES
When production is down:
1. **Immediate mitigation** (rollback, kill switch, manual fix)
2. **Communication** (status page, stakeholders, team)
3. **Root cause analysis** within 24 hours
4. **Proper fix** within next sprint
5. **Process improvement** to prevent recurrence

---

*"The best system is one that enables good decisions by default and makes bad decisions obviously painful."*