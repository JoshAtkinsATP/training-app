export const metadata = { title: 'Privacy notice' }

// DRAFT. Needs review by an Australian privacy lawyer before real clients use the app.
// Items in [square brackets] must be filled in by the business.
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-sm leading-6">
      <p className="mb-4 rounded border border-amber-500 px-3 py-2">
        Draft. This notice has not yet been reviewed by a lawyer.
      </p>
      <h1 className="mb-4 text-2xl font-semibold">Privacy notice</h1>

      <h2 className="mt-6 font-semibold">Who we are</h2>
      <p>
        [Business name and ABN] (&quot;we&quot;) provides strength and conditioning coaching through this app.
        Contact for privacy questions: [privacy contact email].
      </p>

      <h2 className="mt-6 font-semibold">What we collect</h2>
      <p>
        Your name, email and time zone. Your training: sessions, sets, reps, loads, runs, heart rate and how hard
        sessions felt. Your check-in answers, such as soreness, sleep and readiness. Injury and niggle notes you
        enter, and comments you write to your coach. Nutrition targets and numbers you enter. Information about you
        that relates to your health is sensitive information under the Privacy Act 1988 (Cth). We collect it only with
        your consent.
      </p>

      <h2 className="mt-6 font-semibold">Why we collect it</h2>
      <p>
        To write and adjust your programme, track your training load, keep you safe, and respond to your messages. We
        do not sell your information and we do not use it for advertising.
      </p>

      <h2 className="mt-6 font-semibold">Who can see it</h2>
      <p>
        You can see your own information. Your coach can see it. Nobody else using the app can. Our service providers
        process it for us: [hosting provider, database provider, email provider, push notification provider]. Some
        providers may store or access data outside Australia: [list countries once confirmed].
      </p>

      <h2 className="mt-6 font-semibold">How we protect it</h2>
      <p>
        Data is sent over encrypted connections and stored encrypted. Access is limited by role. Coach access to your
        health information is logged.
      </p>

      <h2 className="mt-6 font-semibold">Your rights</h2>
      <p>
        You can ask to see or correct your information, or to have it deleted, by contacting [privacy contact email].
        If you are not satisfied with our response you can complain to the Office of the Australian Information
        Commissioner (oaic.gov.au).
      </p>

      <h2 className="mt-6 font-semibold">How long we keep it</h2>
      <p>[Retention period to be confirmed.]</p>
    </main>
  )
}
