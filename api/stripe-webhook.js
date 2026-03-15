import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed')
  }

  const sig = req.headers['stripe-signature']

  if (!sig) {
    return res.status(400).send('Missing Stripe-Signature header')
  }

  let event

  try {
    const rawBody = await readRawBody(req)

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata?.userId

      if (userId) {
        await supabaseAdmin
          .from('profiles')
          .update({
            plan: 'pro',
            stripe_customer_id: session.customer || null,
            stripe_subscription_id: session.subscription || null,
          })
          .eq('id', userId)
      }
    }

    if (
      event.type === 'customer.subscription.deleted' ||
      event.type === 'customer.subscription.updated'
    ) {
      const subscription = event.data.object

      const customerId = subscription.customer
      const isActive =
        subscription.status === 'active' || subscription.status === 'trialing'

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (profile?.id) {
        await supabaseAdmin
          .from('profiles')
          .update({
            plan: isActive ? 'pro' : 'free',
            stripe_subscription_id: subscription.id || null,
          })
          .eq('id', profile.id)
      }
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    return res.status(500).send(error.message)
  }
}