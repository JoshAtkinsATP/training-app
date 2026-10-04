// Fixed lists shared by the pages and the import. The tag lists themselves
// (regions, joint actions, muscles) live in the database; these are the small fixed ones.

export const EXERCISE_KINDS = [
  { value: 'strength', label: 'Strength' },
  { value: 'plyometric', label: 'Plyometric and power' },
  { value: 'conditioning', label: 'Conditioning and running' },
  { value: 'mobility', label: 'Mobility and stretch' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'test', label: 'Test' },
  { value: 'other', label: 'Other' },
] as const
export type ExerciseKind = (typeof EXERCISE_KINDS)[number]['value']

// Must match the check constraint on exercise_swap_option.body_area in migration 0002.
export const BODY_AREAS = [
  { value: 'neck', label: 'Neck' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'wrist_hand', label: 'Wrist or hand' },
  { value: 'upper_back', label: 'Upper back' },
  { value: 'lower_back', label: 'Lower back' },
  { value: 'hip_groin', label: 'Hip or groin' },
  { value: 'glute', label: 'Glute' },
  { value: 'thigh_front', label: 'Front of thigh' },
  { value: 'hamstring', label: 'Hamstring' },
  { value: 'knee', label: 'Knee' },
  { value: 'calf_shin', label: 'Calf or shin' },
  { value: 'ankle_foot', label: 'Ankle or foot' },
] as const
export type BodyArea = (typeof BODY_AREAS)[number]['value']

export const CONTRACTIONS = ['concentric', 'eccentric', 'isometric'] as const
export type Contraction = (typeof CONTRACTIONS)[number]

export const MUSCLE_ROLES = ['primary', 'secondary'] as const
export type MuscleRole = (typeof MUSCLE_ROLES)[number]

/** Share of a set's load that counts towards a muscle, by role. Matches the database import function. */
export const MUSCLE_WEIGHT: Record<MuscleRole, number> = { primary: 1.0, secondary: 0.5 }

export const EQUIPMENT = [
  'barbell', 'dumbbell', 'kettlebell', 'cable', 'band', 'machine', 'trap bar', 'ez bar', 'smith machine',
  'med ball', 'sled', 'trx', 'bodyweight', 'bench', 'box', 'pull-up bar', 'ghd', 'bike', 'rower', 'treadmill',
] as const
