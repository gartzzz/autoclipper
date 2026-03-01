// AutoClipper: Stripe webhook handler (Supabase Edge Function)
// Receives payment events and updates user plan in profiles table
//
// Deploy: supabase functions deploy stripe-webhook
// Secrets needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
  });

  // Verify Stripe signature
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing signature", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Supabase client with service_role key (bypasses RLS)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Handle checkout completed — user paid
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const supabaseUserId = session.client_reference_id;
    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : null;

    if (supabaseUserId) {
      const { error } = await supabase
        .from("profiles")
        .update({
          plan: "pro",
          stripe_customer_id: stripeCustomerId,
        })
        .eq("id", supabaseUserId);

      if (error) {
        console.error("Failed to update profile:", error);
        return new Response("DB error", { status: 500 });
      }

      console.log(`User ${supabaseUserId} upgraded to Pro`);

      // ─── Referral commission tracking ─────────────────────────────
      try {
        const { data: buyerProfile } = await supabase
          .from("profiles")
          .select("referred_by")
          .eq("id", supabaseUserId)
          .single();

        if (buyerProfile?.referred_by) {
          const { data: affiliate } = await supabase
            .from("profiles")
            .select("id")
            .eq("referral_code", buyerProfile.referred_by)
            .eq("is_affiliate", true)
            .single();

          if (affiliate && affiliate.id !== supabaseUserId) {
            const amountCents = session.amount_total || 0;
            const commissionCents = Math.round(amountCents * 0.20);

            const { error: commError } = await supabase
              .from("commissions")
              .insert({
                affiliate_id: affiliate.id,
                referred_user_id: supabaseUserId,
                stripe_checkout_session_id: session.id,
                amount_cents: amountCents,
                commission_cents: commissionCents,
                status: "pending",
              });

            if (commError) {
              console.error("Failed to create commission:", commError);
            } else {
              console.log(
                `Commission: ${commissionCents}c for affiliate ${affiliate.id}`
              );
            }
          }
        }
      } catch (refErr) {
        console.error("Referral tracking error:", refErr);
      }
    }
  }

  // Handle subscription cancelled — downgrade to free
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeCustomerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : null;

    if (stripeCustomerId) {
      const { error } = await supabase
        .from("profiles")
        .update({ plan: "free" })
        .eq("stripe_customer_id", stripeCustomerId);

      if (error) {
        console.error("Failed to downgrade profile:", error);
        return new Response("DB error", { status: 500 });
      }

      console.log(`Customer ${stripeCustomerId} downgraded to Free`);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
