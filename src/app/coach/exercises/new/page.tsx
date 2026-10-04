import Link from 'next/link'
import { getTaxonomy } from '@/lib/exercises/queries'
import { ExerciseForm } from '../exercise-form'

export const metadata = { title: 'Add an exercise' }

export default async function NewExercise() {
  const taxonomy = await getTaxonomy()
  return (
    <main className="flex flex-col gap-4">
      <Link href="/coach/exercises" className="text-sm underline">Back to exercises</Link>
      <h1 className="text-xl font-semibold">Add an exercise</h1>
      <ExerciseForm taxonomy={taxonomy} />
    </main>
  )
}
