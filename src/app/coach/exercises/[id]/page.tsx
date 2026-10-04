import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getExercise, getTaxonomy } from '@/lib/exercises/queries'
import { ExerciseForm } from '../exercise-form'

export default async function EditExercise({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const { id } = await params
  const { saved } = await searchParams
  const [exercise, taxonomy] = await Promise.all([getExercise(id), getTaxonomy()])
  if (!exercise) notFound()
  return (
    <main className="flex flex-col gap-4">
      <Link href="/coach/exercises" className="text-sm underline">Back to exercises</Link>
      <h1 className="text-xl font-semibold">{exercise.name}</h1>
      <ExerciseForm key={exercise.id} taxonomy={taxonomy} exercise={exercise} justCreated={saved === '1'} />
    </main>
  )
}
