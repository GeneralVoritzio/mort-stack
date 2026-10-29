export const meta = {
  name: 'round',
  description: 'One round: a planner splits the work into lanes with exclusive files, lanes build in parallel, a verifier runs the verify plan plus every CI job locally, one repair, a second verify. Nothing committed, pushed or deployed.',
  phases: [
    { title: 'Plan', detail: 'split the round into lanes with exclusive files' },
    { title: 'Build', detail: 'lanes in parallel' },
    { title: 'Verify', detail: 'verify plan + gate + local CI; one repair; second verify' },
  ],
}

// args: { round, plan, worktree, ports, today, extra?, laneModel?, judgeModel? }
const ROUND = args.round
const PLANDOC = args.plan
const WT = args.worktree
const LANE_MODEL = args.laneModel || 'opus'
const JUDGE_MODEL = args.judgeModel // undefined = session default

const HOUSE = [
  'HOUSE RULES. They override anything you would otherwise do:',
  '- All work happens in ' + WT + '. Other rounds may be running in other worktrees: never write outside ' + WT + '.',
  '- No agent commits, stashes, pushes, deploys or publishes. The orchestrator commits.',
  '- Never read secret files (.env, credentials, key stores). If you run a server, use only ports ' + args.ports + ' and stop it afterwards.',
  '- Copy existing working code or a mature upstream project and cite it. Invent nothing a precedent already solves. Copied files carry a provenance header.',
  '- Read ' + PLANDOC + ', round ' + ROUND + ', before anything else.',
  args.extra || '',
].join('\n')

const PLAN = { type: 'object', required: ['lanes', 'verifyPlan'], properties: {
  lanes: { type: 'array', items: { type: 'object', required: ['name', 'rows', 'work', 'files'], properties: {
    name: { type: 'string' }, rows: { type: 'array', items: { type: 'string' } }, work: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } }, mirror: { type: 'string' } } } },
  verifyPlan: { type: 'string' } } }
const REPORT = { type: 'object', required: ['lane', 'done', 'closed', 'filesChanged', 'gate', 'crossings', 'notes'], properties: {
  lane: { type: 'string' }, done: { type: 'boolean' }, closed: { type: 'array', items: { type: 'string' } },
  filesChanged: { type: 'array', items: { type: 'string' } }, tests: { type: 'string' }, gate: { type: 'string' },
  crossings: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } }
const VERDICT = { type: 'object', required: ['verdict', 'checks', 'ci', 'defects', 'humanActions'], properties: {
  verdict: { type: 'string', enum: ['green', 'red'] },
  checks: { type: 'array', items: { type: 'object', required: ['name', 'result'], properties: { name: { type: 'string' }, result: { type: 'string' } } } },
  ci: { type: 'array', items: { type: 'object', required: ['job', 'result'], properties: { job: { type: 'string' }, result: { type: 'string', enum: ['pass', 'fail', 'not-run'] }, detail: { type: 'string' } } } },
  defects: { type: 'array', items: { type: 'object', required: ['lane', 'severity', 'description', 'fix'], properties: {
    lane: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, description: { type: 'string' }, fix: { type: 'string' } } } },
  humanActions: { type: 'array', items: { type: 'string' } } } }

phase('Plan')
const plan = await agent([HOUSE, '', 'Today: ' + args.today + '.',
  'YOU ARE THE ROUND ' + ROUND + ' PLANNER. Read the round and the code it touches. Split the work into two to four lanes whose file sets DO NOT OVERLAP. Each shared file (lockfile, route table) goes to exactly one lane. For each lane give: the rows it closes, the work, its files, and the existing code or upstream project it must copy from (`mirror`). Then write the verify plan: the round\'s acceptance as concrete commands, plus typecheck, lint and the affected test suites.',
].join('\n'), { label: 'plan', phase: 'Plan', model: JUDGE_MODEL, schema: PLAN })
if (!plan) return { stopped: 'no plan' }
log('plan: ' + plan.lanes.map((l) => l.name + ' (' + l.rows.join('/') + ')').join(', '))

phase('Build')
const reports = (await parallel(plan.lanes.map((l) => () => agent([HOUSE, '', 'Today: ' + args.today + '.',
  'YOU ARE LANE ' + l.name + ' of round ' + ROUND + '. Rows: ' + l.rows.join(', ') + '. Work: ' + l.work + '. Copy from: ' + (l.mirror || 'existing repo code') + '.',
  'Edit only these files and new files inside them: ' + JSON.stringify(l.files) + '.',
  'Other lanes own: ' + JSON.stringify(plan.lanes.filter((o) => o.name !== l.name).map((o) => ({ name: o.name, files: o.files }))) + '. If you need a change in their files, do not make it; list it in `crossings`.',
  'If files in your set already have edits you did not make, read them before writing (a previous run may have stopped partway).',
  'Build it, write tests, run them and the parts of the gate you touched. Report with the schema.',
].join('\n'), { label: 'lane:' + l.name, phase: 'Build', model: LANE_MODEL, schema: REPORT })))).filter(Boolean)
log('lanes: ' + reports.map((r) => r.lane + (r.done ? ' done' : ' incomplete')).join(', '))

const VERIFY = (pass, extra) => [HOUSE, '', 'Today: ' + args.today + '.',
  'YOU ARE THE ROUND ' + ROUND + ' VERIFIER (' + pass + ' pass). Default to red. You fix nothing.',
  'Verify plan: ' + plan.verifyPlan,
  'Lane reports: ' + JSON.stringify(reports.concat(extra || [])),
  'Run the verify plan yourself; do not trust the reports. Also check:',
  '(1) every row a lane claims closed really is closed in code and tests (a false closure is blocking);',
  '(2) nothing was written outside ' + WT + ';',
  '(3) unresolved `crossings` are defects against the owning lane;',
  '(4) LOCAL CI: list every job in the repo\'s CI config and run each one locally (`act -j <job>` if available, otherwise its run steps in order with the pinned versions and env). Report each in `ci`. A job that cannot run here is `not-run` with the reason; it never counts as a pass. Any `fail` makes the verdict red.',
  'List humanActions that only a human can do (deploys, real credentials, accounts, legal sign-off).',
  'Verdict green only with no blocking or should-fix defect and no failing CI job.',
].join('\n')

phase('Verify')
const v1 = await agent(VERIFY('first'), { label: 'verify', phase: 'Verify', model: JUDGE_MODEL, schema: VERDICT })
log('verify 1: ' + (v1 ? v1.verdict + ', ' + v1.defects.length + ' defects' : 'no verdict'))
let repair = null
let v2 = null
if (v1 && v1.verdict === 'red') {
  repair = await agent([HOUSE, '', 'YOU ARE THE ROUND ' + ROUND + ' REPAIR AGENT for every lane. Fix exactly these defects, nits included, then rerun the affected tests and CI jobs:', JSON.stringify(v1.defects, null, 2), 'Failing CI jobs: ' + JSON.stringify(v1.ci.filter((j) => j.result === 'fail'))].join('\n'),
    { label: 'repair', phase: 'Verify', model: LANE_MODEL, schema: REPORT })
  v2 = await agent(VERIFY('second', repair ? [repair] : []), { label: 'verify2', phase: 'Verify', model: JUDGE_MODEL, schema: VERDICT })
  log('verify 2: ' + (v2 ? v2.verdict + ', ' + v2.defects.length + ' defects' : 'no verdict'))
}
return { round: ROUND, plan, reports, v1, repair, v2 }
