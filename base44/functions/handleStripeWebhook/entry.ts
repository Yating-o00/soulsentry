import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("Stripe_API"));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.text();
    
    // Parse the event from the body (in production, add signature verification with STRIPE_WEBHOOK_SECRET)
    let event;
    try {
      event = JSON.parse(body);
    } catch (err) {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata;

      if (!metadata || !metadata.user_email || !metadata.credits) {
        console.log('Missing metadata in session:', session.id);
        return Response.json({ received: true });
      }

      const creditsToAdd = parseInt(metadata.credits, 10);
      const userEmail = metadata.user_email;
      const packId = metadata.pack_id;

      // Find the user and update credits
      const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
      if (users && users.length > 0) {
        const user = users[0];
        const currentCredits = user.ai_credits ?? 200;
        const newBalance = currentCredits + creditsToAdd;

        await base44.asServiceRole.entities.User.update(user.id, { ai_credits: newBalance });

        // Log the transaction
        await base44.asServiceRole.entities.AICreditTransaction.create({
          type: "purchase",
          amount: creditsToAdd,
          balance_after: newBalance,
          description: `Stripe支付购买 ${creditsToAdd} AI点数 (${packId})`,
          created_by: userEmail,
        });

        console.log(`Successfully added ${creditsToAdd} credits to ${userEmail}. New balance: ${newBalance}`);
      } else {
        console.log('User not found:', userEmail);
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});