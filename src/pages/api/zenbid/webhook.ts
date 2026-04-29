import type { APIRoute } from 'astro';

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: {
    bookingId: string;
    serviceId: string;
    customerInfo: any;
    status: string;
    [key: string]: any;
  };
  signature?: string;
  zenbidRequestId: string;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload: WebhookPayload = await request.json();
    
    console.log(`🔔 ZenBid Webhook Received: ${payload.event}`, {
      bookingId: payload.data.bookingId,
      timestamp: payload.timestamp
    });

    // Validate webhook signature (in production, verify against ZenBid secret)
    if (payload.signature && !verifySignature(payload, payload.signature)) {
      return new Response(JSON.stringify({
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle different webhook events
    switch (payload.event) {
      case 'booking.created':
        await handleBookingCreated(payload.data);
        break;
        
      case 'booking.confirmed':
        await handleBookingConfirmed(payload.data);
        break;
        
      case 'booking.cancelled':
        await handleBookingCancelled(payload.data);
        break;
        
      case 'booking.rescheduled':
        await handleBookingRescheduled(payload.data);
        break;
        
      case 'payment.completed':
        await handlePaymentCompleted(payload.data);
        break;
        
      case 'review.created':
        await handleReviewCreated(payload.data);
        break;
        
      case 'agent.inquiry':
        await handleAgentInquiry(payload.data);
        break;
        
      default:
        console.log(`ℹ️ Unknown webhook event: ${payload.event}`);
        break;
    }

    return new Response(JSON.stringify({
      success: true,
      received: payload.event,
      processedAt: new Date().toISOString(),
      message: `Webhook event '${payload.event}' processed successfully`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to process webhook',
      code: 'WEBHOOK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// GET endpoint to verify webhook is working
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({
    success: true,
    service: 'Install Once - ZenBid Webhook Endpoint',
    status: 'active',
    supportedEvents: [
      'booking.created',
      'booking.confirmed', 
      'booking.cancelled',
      'booking.rescheduled',
      'payment.completed',
      'review.created',
      'agent.inquiry'
    ],
    lastPing: new Date().toISOString(),
    businessInfo: {
      name: 'Install Once - Life Transformation Coaching',
      businessId: 'installonce_ai',
      integration: 'active'
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

// Webhook event handlers
async function handleBookingCreated(data: any) {
  console.log('📅 New booking created:', {
    bookingId: data.bookingId,
    service: data.serviceName,
    customer: data.customerInfo?.name,
    scheduledTime: data.scheduledDateTime
  });
  
  // In real implementation:
  // - Add to internal calendar
  // - Send confirmation email to customer
  // - Notify coach via Slack/email
  // - Update dashboard metrics
  
  await sendInternalNotification({
    type: 'booking_created',
    title: '🎉 New Transformation Session Booked!',
    message: `${data.customerInfo?.name} booked ${data.serviceName} for ${formatDateTime(data.scheduledDateTime)}`,
    action: `View Details: https://installonce.ai/business-dashboard/bookings?id=${data.bookingId}`
  });
}

async function handleBookingConfirmed(data: any) {
  console.log('✅ Booking confirmed:', data.bookingId);
  
  // Send welcome email with preparation materials
  await sendCustomerWelcomeEmail(data);
  
  // Add to coach's calendar
  await addToCoachCalendar(data);
}

async function handleBookingCancelled(data: any) {
  console.log('❌ Booking cancelled:', data.bookingId);
  
  // Process refund if applicable
  // Update availability
  // Notify coach
  
  await sendInternalNotification({
    type: 'booking_cancelled',
    title: '⚠️ Session Cancelled',
    message: `${data.customerInfo?.name}'s ${data.serviceName} session has been cancelled`,
    action: 'Time slot now available for rebooking'
  });
}

async function handleBookingRescheduled(data: any) {
  console.log('📅 Booking rescheduled:', {
    bookingId: data.bookingId,
    oldTime: data.originalDateTime,
    newTime: data.scheduledDateTime
  });
  
  // Update calendar
  // Send updated confirmation
  await sendInternalNotification({
    type: 'booking_rescheduled',
    title: '📝 Session Rescheduled',
    message: `${data.customerInfo?.name}'s session moved to ${formatDateTime(data.scheduledDateTime)}`,
    action: 'Calendar updated automatically'
  });
}

async function handlePaymentCompleted(data: any) {
  console.log('💰 Payment completed:', {
    bookingId: data.bookingId,
    amount: data.amount,
    currency: data.currency
  });
  
  // Update booking status
  // Send payment confirmation
  // Trigger pre-session preparation email
}

async function handleReviewCreated(data: any) {
  console.log('⭐ New review received:', {
    bookingId: data.bookingId,
    rating: data.rating,
    review: data.reviewText?.substring(0, 100)
  });
  
  // Update business metrics
  // Send thank you message if rating >= 4
  if (data.rating >= 4) {
    await sendInternalNotification({
      type: 'positive_review',
      title: `⭐ ${data.rating}-Star Review Received!`,
      message: `"${data.reviewText?.substring(0, 100)}..." - ${data.customerInfo?.name}`,
      action: 'Consider featuring this testimonial'
    });
  }
}

async function handleAgentInquiry(data: any) {
  console.log('🤖 Agent inquiry:', {
    agentId: data.agentId,
    inquiryType: data.inquiryType,
    serviceInterest: data.serviceId
  });
  
  // Log agent interaction
  // Provide specialized agent response
  // Track conversion rates by agent type
}

// Helper functions
function verifySignature(payload: WebhookPayload, signature: string): boolean {
  // In production, verify webhook signature against ZenBid secret
  // For now, just return true (all webhooks accepted)
  return true;
}

async function sendInternalNotification(notification: {
  type: string;
  title: string;
  message: string;
  action: string;
}) {
  console.log(`🔔 Internal Notification [${notification.type}]:`, {
    title: notification.title,
    message: notification.message,
    action: notification.action,
    timestamp: new Date().toISOString()
  });
  
  // In real implementation:
  // - Send to Slack channel
  // - Email coach/admin
  // - Push to business dashboard
  // - Update metrics/analytics
}

async function sendCustomerWelcomeEmail(data: any) {
  console.log('📧 Sending welcome email to:', data.customerInfo?.email);
  
  // In real implementation:
  // - Send personalized welcome email
  // - Include Zoom link
  // - Attach preparation materials
  // - Set calendar reminders
}

async function addToCoachCalendar(data: any) {
  console.log('📅 Adding to coach calendar:', {
    service: data.serviceName,
    time: data.scheduledDateTime,
    duration: data.duration,
    customer: data.customerInfo?.name
  });
  
  // In real implementation:
  // - Add to Google Calendar
  // - Set reminders
  // - Include customer details
  // - Add Zoom meeting link
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York'
  });
}