import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("Stripe_API"));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { packId, packName, credits, price } = await req.json();

    if (!packId || !credits || !price) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // price is in CNY (元), convert to fen (分) for Stripe
    const unitAmount = Math.round(price * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'alipay'],
      line_items: [{
        price_data: {
          currency: 'cny',
          product_data: {
            name: `SoulSentry AI 点数 - ${packName}`,
            description: `${credits} AI 点数`,
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: {
        user_email: user.email,
        user_id: user.id,
        pack_id: packId,
        credits: String(credits),
      },
      success_url: `${req.headers.get('origin') || 'https://app.base44.com'}/Pricing?payment=success&credits=${credits}`,
      cancel_url: `${req.headers.get('origin') || 'https://app.base44.com'}/Pricing?payment=cancelled`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});