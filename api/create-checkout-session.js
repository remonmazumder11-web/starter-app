import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { plan, userId, userEmail } = req.body

    if (!plan || !userId || !userEmail) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    let priceId = ''

    if (plan === 'monthly') {
      priceId = process.env.STRIPE_PRICE_MONTHLY
    } else if (plan === 'yearly') {
      priceId = process.env.STRIPE_PRICE_YEARLY
    } else {
      return res.status(400).json({ error: 'Invalid plan' })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL}?checkout=success`,
      cancel_url: `${process.env.APP_URL}?checkout=cancelled`,
      metadata: {
        userId,
        plan,
      },
    })

    return res.status(200).json({ url: session.url })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}