import type { APIRoute } from 'astro';

interface BookingRequest {
  serviceId: string;
  requestedDate: string;
  requestedTime: string;
  customerInfo: {
    name: string;
    email: string;
    phone?: string;
    agentId?: string; // When booked by AI agent
  };
  pricing: {
    offeredPrice: number;
    acceptedPrice?: number;
    currency: string;
  };
  requirements?: string;
  duration?: number;
  location?: 'virtual' | 'in-person';
}

interface BookingResponse {
  bookingId: string;
  status: 'confirmed' | 'pending' | 'requires_negotiation' | 'declined';
  finalPrice: number;
  scheduledDateTime: string;
  duration: number;
  location: string;
  confirmationCode: string;
  paymentRequired: boolean;
  nextSteps: string[];
  businessContact: {
    email: string;
    phone: string;
    calendar?: string;
  };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const bookingRequest: BookingRequest = await request.json();
    
    // Validate required fields
    if (!bookingRequest.serviceId || !bookingRequest.requestedDate || 
        !bookingRequest.customerInfo?.email) {
      return new Response(JSON.stringify({
        error: 'Missing required booking information',
        code: 'INVALID_REQUEST',
        required: ['serviceId', 'requestedDate', 'customerInfo.email']
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Service lookup
    const services = {
      'identity_installation': {
        name: 'Identity Installation Session',
        basePrice: 150,
        duration: 90,
        category: 'transformation'
      },
      'habit_diagnostic': {
        name: 'Habit Diagnostic Consultation', 
        basePrice: 75,
        duration: 45,
        category: 'diagnostic'
      },
      'deep_settings': {
        name: 'Deep Settings Reconfiguration',
        basePrice: 200,
        duration: 120,
        category: 'intensive'
      }
    };

    const service = services[bookingRequest.serviceId as keyof typeof services];
    if (!service) {
      return new Response(JSON.stringify({
        error: 'Service not found',
        code: 'INVALID_SERVICE',
        availableServices: Object.keys(services)
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Calculate current pricing with dynamic rules
    const requestDate = new Date(bookingRequest.requestedDate);
    const currentPrice = calculateServicePrice(service.basePrice, {
      requestDate,
      timeSlot: bookingRequest.requestedTime,
      isWeekend: requestDate.getDay() === 0 || requestDate.getDay() === 6,
      isEarlyMorning: bookingRequest.requestedTime?.startsWith('08:') || bookingRequest.requestedTime?.startsWith('09:'),
      isSameDay: requestDate.toDateString() === new Date().toDateString()
    });

    // Handle pricing negotiation
    const offeredPrice = bookingRequest.pricing.offeredPrice;
    let bookingStatus: BookingResponse['status'] = 'confirmed';
    let finalPrice = currentPrice.finalPrice;
    let negotiationMessage = '';

    // Negotiation logic
    if (offeredPrice < currentPrice.finalPrice * 0.7) {
      // Offer too low (less than 70% of current price)
      bookingStatus = 'requires_negotiation';
      const counterOffer = Math.round(currentPrice.finalPrice * 0.85); // Counter with 15% discount
      finalPrice = counterOffer;
      negotiationMessage = `We appreciate your interest! Your offer of $${offeredPrice} is below our current rate of $${currentPrice.finalPrice}. We can offer this session for $${counterOffer} - a special rate that reflects our commitment to transformation. Would you like to proceed at this price?`;
    } else if (offeredPrice < currentPrice.finalPrice) {
      // Reasonable offer - accept with small adjustment
      const counterOffer = Math.round((offeredPrice + currentPrice.finalPrice) / 2);
      finalPrice = counterOffer;
      negotiationMessage = `Great! We can meet you halfway at $${counterOffer}. This ensures we can deliver the full transformation experience while honoring your budget.`;
    } else {
      // Offer at or above current price - instant confirmation
      finalPrice = offeredPrice;
    }

    // Generate booking details
    const bookingId = `IO_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
    const confirmationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Simulate availability check (in real system, would check actual calendar)
    const isTimeSlotAvailable = checkAvailability(
      bookingRequest.serviceId,
      bookingRequest.requestedDate,
      bookingRequest.requestedTime
    );

    if (!isTimeSlotAvailable) {
      // Suggest alternative times
      const alternatives = getAlternativeTimeSlots(
        bookingRequest.requestedDate,
        bookingRequest.requestedTime
      );

      return new Response(JSON.stringify({
        success: false,
        status: 'time_unavailable',
        message: 'Requested time slot is not available',
        alternatives,
        suggestedAction: 'Please select an alternative time or we can recommend the best available slot.'
      }), {
        status: 409, // Conflict
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const response: BookingResponse = {
      bookingId,
      status: bookingStatus,
      finalPrice,
      scheduledDateTime: `${bookingRequest.requestedDate}T${bookingRequest.requestedTime}:00.000Z`,
      duration: service.duration,
      location: bookingRequest.location === 'in-person' ? 'New York, NY' : 'Virtual (Zoom link will be provided)',
      confirmationCode,
      paymentRequired: true,
      nextSteps: generateNextSteps(bookingStatus, service, finalPrice),
      businessContact: {
        email: 'coaching@installonce.ai',
        phone: '+1-555-INSTALL',
        calendar: 'https://installonce.ai/calendar'
      }
    };

    // Add negotiation message if applicable
    if (negotiationMessage) {
      (response as any).negotiationMessage = negotiationMessage;
      (response as any).originalPrice = currentPrice.finalPrice;
      (response as any).yourOffer = offeredPrice;
    }

    // Add pricing breakdown
    (response as any).pricingBreakdown = {
      basePrice: service.basePrice,
      appliedRules: currentPrice.appliedRules,
      finalPrice,
      currency: 'USD',
      savings: service.basePrice > finalPrice ? service.basePrice - finalPrice : undefined
    };

    // Simulate business notification (in real system, would send email/webhook)
    console.log(`📅 NEW BOOKING: ${service.name} - ${bookingRequest.customerInfo.name} - $${finalPrice} - ${bookingRequest.requestedDate} ${bookingRequest.requestedTime}`);

    return new Response(JSON.stringify({
      success: true,
      booking: response,
      message: bookingStatus === 'confirmed' 
        ? 'Booking confirmed! Transformation session scheduled.' 
        : 'Booking pending - please respond to our pricing adjustment.',
      metadata: {
        bookedAt: new Date().toISOString(),
        businessName: 'Install Once - Life Transformation Coaching',
        serviceName: service.name,
        coachAssigned: 'Gordon Ebanks - Master Transformation Coach'
      }
    }), {
      status: bookingStatus === 'confirmed' ? 200 : 202, // 202 = Accepted, processing
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });

  } catch (error) {
    console.error('Booking API error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to process booking',
      code: 'BOOKING_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Get current bookings (for business dashboard)
export const GET: APIRoute = async ({ url }) => {
  const searchParams = new URLSearchParams(url.search);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const status = searchParams.get('status') || 'all';

  // Simulate booking data (in real system, would fetch from database)
  const bookings = [
    {
      bookingId: 'IO_1730160000_ABC123',
      serviceId: 'habit_diagnostic',
      serviceName: 'Habit Diagnostic Consultation',
      customerName: 'Sarah M.',
      customerEmail: 'sarah.m@example.com',
      scheduledDateTime: '2026-04-29T10:00:00.000Z',
      duration: 45,
      finalPrice: 60, // Discounted from $75
      status: 'confirmed',
      location: 'Virtual',
      confirmationCode: 'HD2904',
      appliedRules: ['Weekday Special: 20% off Monday & Tuesday'],
      bookedAt: '2026-04-28T22:30:00.000Z',
      agentBooked: true,
      agentId: 'openai_agent_gpt4'
    },
    {
      bookingId: 'IO_1730163600_DEF456',
      serviceId: 'identity_installation',
      serviceName: 'Identity Installation Session',
      customerName: 'Mike R.',
      customerEmail: 'mike.r@example.com',
      scheduledDateTime: '2026-04-29T14:00:00.000Z',
      duration: 90,
      finalPrice: 120, // Negotiated from $150
      status: 'confirmed',
      location: 'Virtual',
      confirmationCode: 'II2914',
      appliedRules: ['Weekday Special: 20% off Monday & Tuesday'],
      bookedAt: '2026-04-28T21:45:00.000Z',
      agentBooked: false,
      negotiatedPrice: true
    }
  ];

  let filteredBookings = bookings;
  
  if (status !== 'all') {
    filteredBookings = bookings.filter(b => b.status === status);
  }

  return new Response(JSON.stringify({
    success: true,
    bookings: filteredBookings,
    summary: {
      total: filteredBookings.length,
      confirmed: filteredBookings.filter(b => b.status === 'confirmed').length,
      pending: filteredBookings.filter(b => b.status === 'pending').length,
      totalRevenue: filteredBookings.reduce((sum, b) => sum + b.finalPrice, 0),
      agentBookings: filteredBookings.filter(b => b.agentBooked).length
    },
    date,
    timezone: 'America/New_York'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

// Helper functions
function calculateServicePrice(basePrice: number, context: any) {
  let finalPrice = basePrice;
  const appliedRules: string[] = [];

  const dayOfWeek = context.requestDate.getDay();
  if (dayOfWeek === 1 || dayOfWeek === 2) { 
    finalPrice *= 0.8;
    appliedRules.push('Weekday Special: 20% off Monday & Tuesday');
  }

  if (context.isEarlyMorning) {
    finalPrice *= 0.85;
    appliedRules.push('Early Bird Special: 15% off 8-10am slots');
  }

  if (context.isSameDay) {
    finalPrice *= 0.75;
    appliedRules.push('Same-Day Special: 25% off last-minute bookings');
  }

  if (context.isWeekend && !context.isSameDay) {
    finalPrice *= 1.2;
    appliedRules.push('Weekend Premium: +20% for high-demand times');
  }

  return { finalPrice: Math.round(finalPrice), appliedRules };
}

function checkAvailability(serviceId: string, date: string, time: string): boolean {
  // Simulate availability (90% chance slot is available)
  return Math.random() > 0.1;
}

function getAlternativeTimeSlots(requestedDate: string, requestedTime: string): string[] {
  const alternatives = [
    '09:00', '11:00', '13:00', '15:00', '16:30'
  ];
  
  return alternatives
    .filter(time => time !== requestedTime.substring(0, 5))
    .slice(0, 3)
    .map(time => `${requestedDate}T${time}:00.000Z`);
}

function generateNextSteps(status: string, service: any, price: number): string[] {
  const baseSteps = [
    'Check your email for booking confirmation and calendar invite',
    'Payment will be processed 24 hours before your session',
    'Prepare any specific questions or challenges you want to address'
  ];

  if (service.category === 'diagnostic') {
    baseSteps.push('Complete the pre-session habit assessment (link in confirmation email)');
  }

  if (service.category === 'intensive') {
    baseSteps.push('Block 2.5 hours total (includes 30 min post-session integration)');
    baseSteps.push('Ensure you have a quiet, private space for deep work');
  }

  if (status === 'requires_negotiation') {
    baseSteps.unshift('Respond to our pricing adjustment within 24 hours to secure your slot');
  }

  return baseSteps;
}