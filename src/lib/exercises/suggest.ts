import type { Contraction, ExerciseKind, MuscleRole } from './taxonomy'

// Proposes tags for an exercise from its name. These are suggestions for the coach to review,
// never final answers. Anything the rules do not recognise comes back as confidence "none".

export type Suggestion = {
  kind: ExerciseKind
  region: string | null
  pattern: string | null
  jointActions: { slug: string; contraction: Contraction }[]
  muscles: { slug: string; role: MuscleRole }[]
  equipment: string[]
  isUnilateral: boolean
  /** good: a rule matched. check: a rule matched but is approximate. none: nothing matched. */
  confidence: 'good' | 'check' | 'none'
  rule: string | null
}

export function normaliseForMatching(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Things that are in a TrainHeroic library but are not exercises: goals, questions,
// intro clips, notes, placeholders. Left out of the import by default.
// ---------------------------------------------------------------------------

const NOT_EXERCISE: RegExp[] = [
  /^goals?\b/,
  /^intro clip\b/,
  /^(notes?|questions?|answers?|anything|choice|rest|total kms|arms|legs)$/,
  /^warm up anything$/,
  /^(push|pull)( main set| super ?set)?$/,
  /^core exercise$/,
  /^stretch playlist$/,
]

export function looksLikeNotAnExercise(name: string): boolean {
  const n = normaliseForMatching(name)
  return n === '' || NOT_EXERCISE.some((re) => re.test(n))
}

// ---------------------------------------------------------------------------
// Equipment and unilateral detection
// ---------------------------------------------------------------------------

const EQUIPMENT_RULES: [RegExp, string][] = [
  [/\b(bb|barbell|barbel)\b/, 'barbell'],
  [/\b(db|dbs|dumbbell|dumbell|dumbbells)\b/, 'dumbbell'],
  [/\b(kb|kettlebell|kettlebells)\b/, 'kettlebell'],
  [/\bcable\b|\bpaloff press cable\b|\bkatana\b/, 'cable'],
  [/\b(band|banded|bands|rb)\b/, 'band'],
  [/\b(machine|pec dec|leg press|hack squat|leg extension|stair master|isolateral|seated shoulder press machine)\b/, 'machine'],
  [/\btrap bar\b/, 'trap bar'],
  [/\bez bar\b/, 'ez bar'],
  [/\bsmith\b/, 'smith machine'],
  [/\b(mb|med ball|medicine ball)\b/, 'med ball'],
  [/\bsled\b/, 'sled'],
  [/\btrx\b/, 'trx'],
  [/\b(bw|body weight|bodyweight|push up|pull up|chin up|dips?|plank|air squats?)\b/, 'bodyweight'],
  [/\bbench\b/, 'bench'],
  [/\bbox\b/, 'box'],
  [/\b(pull up|chin up|dead hang|toes to bar|hanging)\b/, 'pull-up bar'],
  [/\bghd\b/, 'ghd'],
  [/\b(bike|assault bike|spin|x trainer)\b/, 'bike'],
  [/\b(row erg|ski erg)\b/, 'rower'],
  [/\btreadmill\b/, 'treadmill'],
]

export function detectEquipment(name: string): string[] {
  const n = normaliseForMatching(name)
  return [...new Set(EQUIPMENT_RULES.filter(([re]) => re.test(n)).map(([, e]) => e))]
}

const UNILATERAL = /\b(single (arm|leg)|sl|sa|unilateral|split|bulgarian|lunges?|step ups?|step downs?|skater|cossack|one arm|alternating|alt)\b/

// ---------------------------------------------------------------------------
// Kind
// ---------------------------------------------------------------------------

function detectKind(n: string): ExerciseKind {
  if (/\bnon testing\b/.test(n)) return 'plyometric'
  if (/\b(test|testing)\b|\billinois\b|\b30 15\b|\bbeep\b/.test(n)) return 'test'
  if (/\b(sauna|ice bath|trigger|foam roll)\b/.test(n)) return 'recovery'
  if (/\b(stretch|mobility|yoga|cat cow|ttn|wgs|walk outs?)\b/.test(n)) return 'mobility'
  if (/\b(jumps?|hops?|pogos?|bounds?|bounding|skip|skips|throws?|slams?|depth|drop jumps?|tripple|triple jump|plyo)\b/.test(n)) return 'plyometric'
  if (
    /\b(run|runs|sprint|sprints|fartlek|treadmill|tabata|shuttle|mas|intervals?|bike|assault|erg|stair master|elliptical|swimming|bag work|pack march|burpee|mt climber|bear crawl|drill|drills|stop and go|zone 2|steady state|x trainer)\b|^walk$/.test(n) &&
    !/\b(farmers?|carry|walking lunges?|lunges?|walk out|hip thrust|sled|crab walk|side step)\b/.test(n)
  )
    return 'conditioning'
  return 'strength'
}

// ---------------------------------------------------------------------------
// Movement rules. The first rule that matches wins, so specific rules come before general ones.
// ---------------------------------------------------------------------------

type Rule = {
  id: string
  re: RegExp
  region: string
  pattern?: string
  ja?: string[]
  pri?: string[]
  sec?: string[]
  kind?: ExerciseKind
  contraction?: Contraction
  check?: boolean
}

const rule = (id: string, re: RegExp, spec: Omit<Rule, 'id' | 're'>): Rule => ({ id, re, ...spec })

const RULES: Rule[] = [
  // ---- Tests ---------------------------------------------------------------
  rule('test-field', /\b(beep test|30 15|illinois test|t test)\b/, { region: 'whole_body', kind: 'test' }),
  rule('test-knee-wall', /\bknee to wall\b/, { region: 'lower_body', kind: 'test', ja: ['ankle_dorsiflexion'] }),
  rule('test-sit-reach', /\bsit and reach\b/, { region: 'lower_body', kind: 'test', pri: ['hamstrings'] }),
  rule('test-deep-squat', /\bdeep squat test\b/, { region: 'lower_body', kind: 'test' }),

  // ---- Stretches and mobility (before strength so "stretch hammy" is not a curl) --
  rule('stretch-adductors', /\bstretch adductors?\b/, { region: 'lower_body', pattern: 'mobility', pri: ['hip_adductors'] }),
  rule('stretch-calf', /\bstretch calf\b|\bstretch ankle\b|\bankle mobility\b/, { region: 'lower_body', pattern: 'mobility', pri: ['gastrocnemius', 'soleus'] }),
  rule('stretch-hammy', /\bstretch hammy\b/, { region: 'lower_body', pattern: 'mobility', pri: ['hamstrings'] }),
  rule('stretch-hipflexor', /\bstretch (hip flexor|couch stretch)\b|\bcouch stretch\b/, { region: 'lower_body', pattern: 'mobility', pri: ['hip_flexors', 'quadriceps'] }),
  rule('stretch-quads', /\bstretch quads?\b/, { region: 'lower_body', pattern: 'mobility', pri: ['quadriceps'] }),
  rule('stretch-glutes', /\bstretch (glutes|piriformis)\b/, { region: 'lower_body', pattern: 'mobility', pri: ['gluteus_maximus', 'gluteus_medius'] }),
  rule('stretch-plantar', /\b(stretch|trigger) plantar fascia\b/, { region: 'lower_body', pattern: 'mobility' }),
  rule('stretch-hip', /\bstretch (hip release|knee over knees)\b|\bbanded hip mobility\b|\bhip release\b/, { region: 'lower_body', pattern: 'mobility', pri: ['gluteus_medius', 'hip_adductors'] }),
  rule('stretch-chest', /\bstretch chest\b/, { region: 'upper_body', pattern: 'mobility', pri: ['pectoralis_major'] }),
  rule('stretch-lats', /\bstretch lats\b/, { region: 'upper_body', pattern: 'mobility', pri: ['latissimus_dorsi'] }),
  rule('stretch-midtrap', /\bstretch mid trap\b/, { region: 'upper_body', pattern: 'mobility', pri: ['trapezius_mid_lower'] }),
  rule('stretch-back', /\bstretch (lower back|cat cow)\b|\bcat cow\b/, { region: 'trunk', pattern: 'mobility', pri: ['erector_spinae'] }),
  rule('stretch-general', /\b(stretch|yoga|mobility|walk outs?|ttn|wgs|bretzle)\b/, { region: 'whole_body', pattern: 'mobility', check: true }),
  rule('neck-warmup', /\bneck warm up\b/, { region: 'upper_body', pattern: 'mobility', kind: 'mobility', ja: ['neck_flexion'] }),

  // ---- Recovery ------------------------------------------------------------
  rule('recovery', /\b(sauna|ice bath)\b/, { region: 'whole_body', kind: 'recovery' }),

  // ---- Carries -------------------------------------------------------------
  rule('carry', /\b(farmers? walk|suitcase carry|overhead carry|offset (overhead|racked) carry|racked march|pack march)\b/, {
    region: 'whole_body', pattern: 'carry', pri: ['forearm_flexors', 'trapezius_upper', 'erector_spinae'], sec: ['obliques', 'gluteus_medius'], contraction: 'isometric',
  }),

  // ---- Olympic and power ---------------------------------------------------
  rule('olympic', /\b(hang clean|hang snatch|snatch|clean and press|jerk)\b/, {
    region: 'whole_body', pattern: 'olympic', ja: ['hip_extension', 'knee_extension', 'ankle_plantar_flexion', 'scapular_elevation'],
    pri: ['gluteus_maximus', 'quadriceps', 'hamstrings'], sec: ['trapezius_upper', 'deltoid_anterior', 'erector_spinae'],
  }),
  rule('thruster', /\b(thruster|wall balls?|man maker|devil press|burpee)\b/, {
    region: 'whole_body', pattern: 'squat', ja: ['knee_extension', 'hip_extension', 'shoulder_flexion', 'elbow_extension'],
    pri: ['quadriceps', 'gluteus_maximus'], sec: ['deltoid_anterior', 'triceps_brachii'], check: true,
  }),
  rule('get-up', /\bturkish get up\b/, { region: 'whole_body', pattern: 'core_brace', pri: ['obliques', 'deltoid_anterior'], sec: ['gluteus_maximus', 'rectus_abdominis'], check: true }),

  rule('triple-ext-iso', /\btripple extension\b|\btriple extension\b/, { region: 'lower_body', pattern: 'squat', ja: ['ankle_plantar_flexion', 'knee_extension', 'hip_extension'], pri: ['quadriceps', 'gluteus_maximus'], sec: ['gastrocnemius'], contraction: 'isometric', kind: 'strength' }),

  // ---- Jumps and hops (before squats so "squat jump" is a jump) ------------
  rule('pogo', /\bpogos?\b/, { region: 'lower_body', pattern: 'jump', ja: ['ankle_plantar_flexion', 'knee_extension'], pri: ['gastrocnemius', 'soleus'], sec: ['quadriceps'] }),
  rule('jump', /\b(jumps?|hops?|bounds?|bounding|tripple|triple jump|cmj|skips?|a skip|lateral shuffle)\b|\bslingshot\b|\breach and bound\b/, {
    region: 'lower_body', pattern: 'jump', ja: ['ankle_plantar_flexion', 'knee_extension', 'hip_extension'],
    pri: ['quadriceps', 'gluteus_maximus'], sec: ['gastrocnemius', 'hamstrings'],
  }),

  // ---- Throws --------------------------------------------------------------
  rule('throw', /\b(mb|med ball|medicine ball)\b|\bthrows?\b|\bslams?\b/, {
    region: 'whole_body', pattern: 'throw', ja: ['hip_extension', 'trunk_rotation'], pri: ['obliques', 'gluteus_maximus'], sec: ['pectoralis_major', 'deltoid_anterior'], check: true,
  }),

  // ---- Lower body: squat, lunge, hinge -------------------------------------
  rule('cossack', /\bcossack\b/, { region: 'lower_body', pattern: 'lunge', ja: ['knee_extension', 'hip_extension', 'hip_adduction'], pri: ['quadriceps', 'hip_adductors'], sec: ['gluteus_maximus'] }),
  rule('lunge', /\b(split squat|bulgarian|lunges?|step ups?|step downs?|skater squat|peterson|poliquin|kick through)\b/, {
    region: 'lower_body', pattern: 'lunge', ja: ['knee_extension', 'hip_extension'], pri: ['quadriceps', 'gluteus_maximus'], sec: ['hamstrings', 'gluteus_medius'],
  }),
  rule('deadlift', /\b(deadlift|rack pull)\b/, { region: 'lower_body', pattern: 'hinge', ja: ['hip_extension', 'knee_extension'], pri: ['gluteus_maximus', 'hamstrings', 'erector_spinae'], sec: ['quadriceps', 'forearm_flexors'] }),
  rule('row-pendlay', /\bpendlay row\b/, { region: 'upper_body', pattern: 'pull_horizontal', ja: ['shoulder_extension', 'scapular_retraction', 'elbow_flexion'], pri: ['latissimus_dorsi', 'rhomboids', 'trapezius_mid_lower'], sec: ['biceps_brachii', 'erector_spinae'] }),
  rule('rdl', /\b(rdl|good morning|jefferson curl)\b/, { region: 'lower_body', pattern: 'hinge', ja: ['hip_extension'], pri: ['gluteus_maximus', 'hamstrings', 'erector_spinae'] }),
  rule('swing', /\bswing\b/, { region: 'lower_body', pattern: 'hinge', ja: ['hip_extension'], pri: ['gluteus_maximus', 'hamstrings'], sec: ['erector_spinae'] }),
  rule('back-ext', /\b(ghd hip extension|hip extension 45|reverse hyperextension)\b/, { region: 'lower_body', pattern: 'hinge', ja: ['hip_extension', 'trunk_extension'], pri: ['gluteus_maximus', 'hamstrings', 'erector_spinae'] }),
  rule('hip-thrust', /\b(hip thrust|glute bridge)\b/, { region: 'lower_body', pattern: 'hinge', ja: ['hip_extension'], pri: ['gluteus_maximus'], sec: ['hamstrings'] }),
  rule('nordic', /\b(nordic|ghd nordic)\b/, { region: 'lower_body', pattern: 'isolation', ja: ['knee_flexion'], pri: ['hamstrings'], sec: ['gastrocnemius'], contraction: 'eccentric' }),
  rule('ham-curl', /\b(hammy|hamstring|leg curl)\b/, { region: 'lower_body', pattern: 'isolation', ja: ['knee_flexion'], pri: ['hamstrings'], sec: ['gastrocnemius'] }),
  rule('leg-ext', /\bleg extension\b/, { region: 'lower_body', pattern: 'isolation', ja: ['knee_extension'], pri: ['quadriceps'] }),
  rule('squat', /\b(squats?|leg press|hack squat|wall sit|squat hold|squat pulse)\b/, {
    region: 'lower_body', pattern: 'squat', ja: ['knee_extension', 'hip_extension'], pri: ['quadriceps', 'gluteus_maximus'], sec: ['hamstrings', 'hip_adductors', 'erector_spinae'],
  }),
  rule('calf-seated', /\bseated calf raise\b/, { region: 'lower_body', pattern: 'isolation', ja: ['ankle_plantar_flexion'], pri: ['soleus'], sec: ['gastrocnemius'] }),
  rule('calf', /\bcalf raise\b/, { region: 'lower_body', pattern: 'isolation', ja: ['ankle_plantar_flexion'], pri: ['gastrocnemius'], sec: ['soleus'] }),
  rule('tib', /\btib raise\b/, { region: 'lower_body', pattern: 'isolation', ja: ['ankle_dorsiflexion'], pri: ['tibialis_anterior'] }),
  rule('adduct', /\b(adductor machine|copenhagen)\b/, { region: 'lower_body', pattern: 'isolation', ja: ['hip_adduction'], pri: ['hip_adductors'], sec: ['obliques'] }),
  rule('abduct', /\b(clams?|abduction|glute med|crab walk|side step|lateral rotation)\b/, { region: 'lower_body', pattern: 'isolation', ja: ['hip_abduction', 'hip_external_rotation'], pri: ['gluteus_medius'], check: true }),
  rule('hip-flex', /\b(psoas march|hip flexor leg raise|knee lift|knee raise)\b/, { region: 'lower_body', pattern: 'isolation', ja: ['hip_flexion'], pri: ['hip_flexors'], sec: ['rectus_abdominis'] }),
  rule('sled', /\bsled\b/, { region: 'lower_body', pattern: 'locomotion', ja: ['knee_extension', 'hip_extension'], pri: ['quadriceps', 'gluteus_maximus'], sec: ['hamstrings', 'gastrocnemius'] }),

  // ---- Core ----------------------------------------------------------------
  rule('side-plank', /\bside plank\b/, { region: 'trunk', pattern: 'core_brace', ja: ['trunk_lateral_flexion'], pri: ['obliques', 'quadratus_lumborum'], sec: ['transversus_abdominis', 'gluteus_medius'], contraction: 'isometric' }),
  rule('reverse-plank', /\breverse plank\b/, { region: 'trunk', pattern: 'core_brace', ja: ['hip_extension', 'trunk_extension'], pri: ['gluteus_maximus', 'hamstrings', 'erector_spinae'], contraction: 'isometric' }),
  rule('plank', /\bplank\b|\bab (wheel|roll)\b|\bbear crawl table top\b|\btable top bear crawl\b/, { region: 'trunk', pattern: 'core_brace', ja: ['trunk_flexion'], pri: ['rectus_abdominis', 'transversus_abdominis'], sec: ['obliques', 'serratus_anterior'], contraction: 'isometric' }),
  rule('bird-dog', /\bbird dog\b/, { region: 'trunk', pattern: 'core_brace', ja: ['trunk_extension'], pri: ['erector_spinae', 'gluteus_maximus'], sec: ['transversus_abdominis'], contraction: 'isometric' }),
  rule('deadbug', /\bdead ?bugs?\b|\bflutter kicks?\b|\bleg raise\b|\bl sit\b|\btoes to bar\b|\bv snap\b|\bv sit\b/, { region: 'trunk', pattern: 'core_brace', ja: ['trunk_flexion', 'hip_flexion'], pri: ['rectus_abdominis', 'hip_flexors'], sec: ['transversus_abdominis'] }),
  rule('paloff', /\bpaloff\b/, { region: 'trunk', pattern: 'rotation', ja: ['trunk_rotation'], pri: ['obliques', 'transversus_abdominis'], contraction: 'isometric' }),
  rule('rotation', /\b(woodchop|wood chop|russian twist|oblique)\b/, { region: 'trunk', pattern: 'rotation', ja: ['trunk_rotation', 'trunk_lateral_flexion'], pri: ['obliques'], sec: ['rectus_abdominis'] }),
  rule('crunch', /\b(sit ?ups?|crunch|v sit|butterfly|dragonfly|captains? chair|captain morgans)\b/, { region: 'trunk', pattern: 'core_brace', ja: ['trunk_flexion'], pri: ['rectus_abdominis'], sec: ['hip_flexors', 'obliques'] }),
  rule('shoulder-taps', /\bshoulder taps?\b|\bmt climber\b/, { region: 'trunk', pattern: 'core_brace', ja: ['trunk_flexion'], pri: ['transversus_abdominis', 'rectus_abdominis'], sec: ['serratus_anterior', 'deltoid_anterior'], contraction: 'isometric', check: true }),

  // ---- Upper body: pulls ---------------------------------------------------
  rule('pull-up', /\b(pull up|chin up|dead hang)\b/, { region: 'upper_body', pattern: 'pull_vertical', ja: ['shoulder_adduction', 'shoulder_extension', 'elbow_flexion', 'scapular_depression'], pri: ['latissimus_dorsi', 'biceps_brachii'], sec: ['trapezius_mid_lower', 'rhomboids', 'brachialis'] }),
  rule('pulldown', /\b(lat pull ?down|pulldown|lat pull through|lat pull over|pullover|lat pullover)\b/, { region: 'upper_body', pattern: 'pull_vertical', ja: ['shoulder_adduction', 'shoulder_extension', 'elbow_flexion'], pri: ['latissimus_dorsi'], sec: ['biceps_brachii', 'trapezius_mid_lower', 'rhomboids'] }),
  rule('rear-delt', /\b(face pull|rear delt|reverse fly|rear fly|wide back fly|pull aparts?|prone y raise|back fly)\b/, { region: 'upper_body', pattern: 'pull_horizontal', ja: ['shoulder_horizontal_abduction', 'scapular_retraction'], pri: ['deltoid_posterior', 'trapezius_mid_lower', 'rhomboids'], sec: ['rotator_cuff'] }),
  rule('ext-rotation', /\b(band ext rotation|ext rotation|external rotation|scapular stabilisation|shoulder depression)\b/, { region: 'upper_body', pattern: 'isolation', ja: ['shoulder_external_rotation'], pri: ['rotator_cuff'], sec: ['trapezius_mid_lower'], check: true }),
  rule('erg', /\b(row erg|ski erg)\b/, { region: 'whole_body' }),
  rule('row', /\b(row|rows|t bar|landmine row|isolateral row|prone row)\b/, { region: 'upper_body', pattern: 'pull_horizontal', ja: ['shoulder_extension', 'scapular_retraction', 'elbow_flexion'], pri: ['latissimus_dorsi', 'rhomboids', 'trapezius_mid_lower'], sec: ['biceps_brachii', 'deltoid_posterior', 'erector_spinae'] }),

  // ---- Upper body: pushes --------------------------------------------------
  rule('fly', /\b(pec dec fly|pec dec|fly|flyes|cable crossover|crossover)\b/, { region: 'upper_body', pattern: 'isolation', ja: ['shoulder_horizontal_adduction'], pri: ['pectoralis_major'], sec: ['deltoid_anterior'] }),
  rule('press-vertical', /\b(shoulder press|push press|z press|arnold press|monkey press|seated y press|landmine press|overhead press|pin shoulder press|bottoms up kb press|chaos shoulder press)\b/, {
    region: 'upper_body', pattern: 'push_vertical', ja: ['shoulder_flexion', 'shoulder_abduction', 'elbow_extension'], pri: ['deltoid_anterior', 'deltoid_lateral', 'triceps_brachii'], sec: ['trapezius_upper', 'serratus_anterior'],
  }),
  rule('seesaw', /\bseesaw press\b/, { region: 'upper_body', pattern: 'push_vertical', ja: ['shoulder_flexion', 'elbow_extension'], pri: ['deltoid_anterior', 'triceps_brachii'], sec: ['serratus_anterior'], check: true }),
  rule('press-horizontal', /\b(bench press|chest press|push ups?|dips|floor press|hex press|press|incline press|decline bench|decline push up)\b/, {
    region: 'upper_body', pattern: 'push_horizontal', ja: ['shoulder_horizontal_adduction', 'elbow_extension', 'scapular_protraction'], pri: ['pectoralis_major', 'triceps_brachii', 'deltoid_anterior'], sec: ['serratus_anterior'],
  }),

  // ---- Upper body: arms and shoulders --------------------------------------
  rule('wrist-curl', /\bwrist curl\b/, { region: 'upper_body', pattern: 'isolation', ja: ['wrist_flexion'], pri: ['forearm_flexors'] }),
  rule('reverse-curl', /\breverse curl\b/, { region: 'upper_body', pattern: 'isolation', ja: ['elbow_flexion'], pri: ['brachialis'], sec: ['biceps_brachii', 'forearm_extensors'] }),
  rule('hammer-curl', /\bhammer curl\b/, { region: 'upper_body', pattern: 'isolation', ja: ['elbow_flexion'], pri: ['brachialis', 'biceps_brachii'] }),
  rule('curl', /\b(bicep curls?|bi curls?|curls?|preacher)\b/, { region: 'upper_body', pattern: 'isolation', ja: ['elbow_flexion'], pri: ['biceps_brachii'], sec: ['brachialis'] }),
  rule('triceps', /\b(tricep|tri ext|tri push ?down|skull crusher|pushdown|oh tri|katana ext)\b/, { region: 'upper_body', pattern: 'isolation', ja: ['elbow_extension'], pri: ['triceps_brachii'] }),
  rule('lat-raise', /\b(lat raise|lateral raise)\b/, { region: 'upper_body', pattern: 'isolation', ja: ['shoulder_abduction'], pri: ['deltoid_lateral'], sec: ['trapezius_upper'] }),
  rule('front-raise', /\bfront raise\b/, { region: 'upper_body', pattern: 'isolation', ja: ['shoulder_flexion'], pri: ['deltoid_anterior'] }),

  // ---- Running and conditioning --------------------------------------------
  rule('run', /\b(run|runs|sprint|sprints|fartlek|treadmill|tabata|shuttle run|mas|zone 2|steady state|stop and go|walk)\b/, {
    region: 'lower_body', pattern: 'sprint_run', ja: ['hip_extension', 'knee_extension', 'ankle_plantar_flexion', 'hip_flexion'], pri: ['hamstrings', 'gluteus_maximus'], sec: ['quadriceps', 'gastrocnemius', 'hip_flexors'],
  }),
  rule('machine-cardio', /\b(bike|assault bike|spin|stair master|elliptical|x trainer)\b/, { region: 'lower_body', pattern: undefined, pri: ['quadriceps', 'gluteus_maximus'], sec: ['hamstrings', 'gastrocnemius'] }),
  rule('whole-cardio', /\b(swimming|bag work|intervals)\b/, { region: 'whole_body', check: true }),
  rule('agility', /\b(drill|drills|agility|cod)\b/, { region: 'lower_body', pattern: 'sprint_run', check: true }),
  rule('crawl', /\bbear crawl\b/, { region: 'whole_body', pattern: 'locomotion', check: true }),
]

// ---------------------------------------------------------------------------

export function suggestTags(name: string): Suggestion {
  const n = normaliseForMatching(name)
  const kind = detectKind(n)
  const equipment = detectEquipment(name)
  const isUnilateral = UNILATERAL.test(n)

  const hit = RULES.find((r) => r.re.test(n))
  if (!hit) {
    return { kind, region: null, pattern: null, jointActions: [], muscles: [], equipment, isUnilateral, confidence: 'none', rule: null }
  }

  let contraction: Contraction = hit.contraction ?? 'concentric'
  if (/\b(iso|isometric|hold|wall sit|dead hang)\b/.test(n)) contraction = 'isometric'
  if (/\beccentric\b/.test(n)) contraction = 'eccentric'

  const muscles = [
    ...(hit.pri ?? []).map((slug) => ({ slug, role: 'primary' as const })),
    ...(hit.sec ?? []).map((slug) => ({ slug, role: 'secondary' as const })),
  ]

  return {
    kind: hit.kind ?? kind,
    region: hit.region,
    pattern: hit.pattern ?? null,
    jointActions: (hit.ja ?? []).map((slug) => ({ slug, contraction })),
    muscles,
    equipment,
    isUnilateral,
    confidence: hit.check ? 'check' : 'good',
    rule: hit.id,
  }
}
