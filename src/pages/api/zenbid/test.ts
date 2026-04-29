import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  const searchParams = new URLSearchParams(url.search);
  const testType = searchParams.get('type') || 'overview';

  switch (testType) {
    case 'overview':
      return testOverview();
    case 'search':
      return testAgentSearch();
    case 'booking':
      return testBookingFlow();
    case 'negotiation':
      return testPriceNegotiation();
    case 'webhook':
      return testWebhookFlow();
    default:
      return testOverview();
  }
};

function testOverview() {
  return new Response(JSON.stringify({
    success: true,
    message: '🎯 ZenBid Integration Test Suite',
    businessProfile: {
      name: 'Install Once - Life Transformation Coaching',
      businessId: 'installonce_ai',
      status: 'active',
      integrationEndpoints: [
        'https://installonce.ai/api/zenbid/business-register',
        'https://installonce.ai/api/zenbid/services',
        'https://installonce.ai/api/zenbid/bookings',
        'https://installonce.ai/api/zenbid/availability',
        'https://installonce.ai/api/zenbid/webhook'
      ]
    },
    availableTests: {
      search: 'Test agent service discovery',
      booking: 'Test complete booking flow',
      negotiation: 'Test price negotiation',
      webhook: 'Test webhook notifications'
    },
    usage: {
      examples: [
        'GET /api/zenbid/test?type=search - Test service search',
        'GET /api/zenbid/test?type=booking - Test booking flow',
        'GET /api/zenbid/test?type=negotiation - Test price negotiation',
        'GET /api/zenbid/test?type=webhook - Test webhook handling'
      ]
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function testAgentSearch() {
  // Simulate AI agent searching for coaching services
  const searchQuery = {
    query: "life coaching sessions to help install new habits",
    location: "New York, NY",
    priceRange: { min: 50, max: 200 },
    date: "2026-04-29",
    preferences: ["transformation", "behavioral change"]
  };

  const simulatedResults = {
    searchPerformed: searchQuery,
    apiCall: 'GET https://installonce.ai/api/zenbid/services',
    responseTime: '245ms',
    resultsFound: 3,
    services: [
      {
        id: 'habit_diagnostic',
        name: 'Habit Diagnostic Consultation',
        provider: 'Install Once - Life Transformation Coaching',
        originalPrice: 75,
        currentPrice: 60, // 20% Tuesday discount
        savings: 15,
        appliedRules: ['Weekday Special: 20% off Monday & Tuesday'],
        rating: 4.8,
        nextAvailable: '2026-04-29T10:00:00Z',
        matchReasons: ['Habit installation', 'Behavioral analysis', 'New York location']
      },
      {
        id: 'identity_installation',
        name: 'Identity Installation Session',
        provider: 'Install Once - Life Transformation Coaching', 
        originalPrice: 150,
        currentPrice: 120,
        savings: 30,
        appliedRules: ['Weekday Special: 20% off Monday & Tuesday'],
        rating: 4.9,
        nextAvailable: '2026-04-29T14:00:00Z',
        matchReasons: ['Identity transformation', 'Habit installation', 'Life coaching']
      },
      {
        id: 'deep_settings',
        name: 'Deep Settings Reconfiguration',
        provider: 'Install Once - Life Transformation Coaching',
        originalPrice: 200,
        currentPrice: 160,
        savings: 40,
        appliedRules: ['Weekday Special: 20% off Monday & Tuesday'],
        rating: 5.0,
        nextAvailable: '2026-04-29T16:00:00Z',
        matchReasons: ['Deep behavioral change', 'Automatic behavior rewiring']
      }
    ],
    agentRecommendation: {
      topPick: 'habit_diagnostic',
      reason: 'Best starting point for habit installation with excellent value',
      confidence: 0.92
    }
  };

  return new Response(JSON.stringify({
    success: true,
    testType: 'agent_search',
    scenario: 'AI Agent discovers Install Once services via ZenBid marketplace',
    simulation: simulatedResults,
    nextStep: 'Agent would now call /bookings endpoint with chosen service'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function testBookingFlow() {
  const bookingRequest = {
    serviceId: 'habit_diagnostic',
    requestedDate: '2026-04-29',
    requestedTime: '10:00',
    customerInfo: {
      name: 'AI Assistant (representing Sarah M.)',
      email: 'sarah.m@example.com',
      agentId: 'openai_gpt4_agent'
    },
    pricing: {
      offeredPrice: 60,
      acceptedPrice: 60,
      currency: 'USD'
    },
    requirements: 'Help with morning routine installation and procrastination patterns',
    location: 'virtual'
  };

  const bookingResponse = {
    bookingId: 'IO_1730160000_TEST123',
    status: 'confirmed',
    finalPrice: 60,
    scheduledDateTime: '2026-04-29T10:00:00.000Z',
    duration: 45,
    location: 'Virtual (Zoom link will be provided)',
    confirmationCode: 'TEST45',
    paymentRequired: true,
    nextSteps: [
      'Check your email for booking confirmation and calendar invite',
      'Payment will be processed 24 hours before your session',
      'Complete the pre-session habit assessment (link in confirmation email)',
      'Prepare specific questions about your morning routine and procrastination'
    ],
    businessContact: {
      email: 'coaching@installonce.ai',
      phone: '+1-555-INSTALL'
    },
    pricingBreakdown: {
      basePrice: 75,
      appliedRules: ['Weekday Special: 20% off Monday & Tuesday'],
      finalPrice: 60,
      savings: 15
    },
    webhookTriggered: {
      event: 'booking.created',
      timestamp: new Date().toISOString(),
      notificationsSent: ['coach email', 'customer confirmation', 'calendar update']
    }
  };

  return new Response(JSON.stringify({
    success: true,
    testType: 'booking_flow',
    scenario: 'Complete booking from agent request to confirmation',
    simulation: {
      request: bookingRequest,
      apiCall: 'POST https://installonce.ai/api/zenbid/bookings',
      responseTime: '380ms',
      response: bookingResponse
    },
    businessImpact: {
      revenueGenerated: 60,
      coachNotified: true,
      calendarUpdated: true,
      customerEmailed: true
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function testPriceNegotiation() {
  const negotiationScenario = {
    initialRequest: {
      serviceId: 'identity_installation',
      basePrice: 150,
      currentPrice: 120, // With Tuesday discount
      agentOffer: 100,
      reason: 'Customer budget constraint'
    },
    negotiationFlow: [
      {
        step: 1,
        actor: 'agent',
        action: 'Initial offer',
        price: 100,
        message: 'Customer can budget $100 for this transformation session'
      },
      {
        step: 2,
        actor: 'business',
        action: 'Counter offer',
        price: 110,
        message: 'We can offer this session for $110 - a special rate that honors your commitment to transformation while ensuring we can deliver the full experience'
      },
      {
        step: 3,
        actor: 'agent',
        action: 'Accept counter',
        price: 110,
        message: 'Accepted! Customer is excited to begin identity installation'
      }
    ],
    finalOutcome: {
      agreed: true,
      finalPrice: 110,
      businessDiscount: 26.7, // From original $150
      customerSavings: 40,
      negotiationTime: '45 seconds',
      conversionRate: 'successful'
    }
  };

  return new Response(JSON.stringify({
    success: true,
    testType: 'price_negotiation',
    scenario: 'AI agent negotiates pricing on behalf of customer',
    simulation: negotiationScenario,
    businessStrategy: {
      minimumAcceptable: '70% of current price',
      negotiationSuccess: 'High - agent representing real customer budget',
      revenueImpact: 'Positive - converted price-sensitive customer'
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function testWebhookFlow() {
  const webhookEvents = [
    {
      event: 'booking.created',
      timestamp: '2026-04-28T22:30:00Z',
      data: {
        bookingId: 'IO_1730160000_WH001',
        serviceId: 'habit_diagnostic',
        serviceName: 'Habit Diagnostic Consultation',
        customerInfo: { name: 'Mike R.', email: 'mike.r@example.com' },
        scheduledDateTime: '2026-04-29T14:00:00Z',
        finalPrice: 60
      },
      businessResponse: 'Coach notified, calendar updated, welcome email sent'
    },
    {
      event: 'payment.completed',
      timestamp: '2026-04-29T10:00:00Z',
      data: {
        bookingId: 'IO_1730160000_WH001',
        amount: 60,
        currency: 'USD',
        paymentMethod: 'agent_wallet'
      },
      businessResponse: 'Payment confirmed, session materials sent, Zoom link provided'
    },
    {
      event: 'review.created', 
      timestamp: '2026-04-29T15:30:00Z',
      data: {
        bookingId: 'IO_1730160000_WH001',
        rating: 5,
        reviewText: 'Incredible session! Gordon helped me identify the exact habit loops keeping me stuck. The personalized installation strategy is already working.',
        customerInfo: { name: 'Mike R.' }
      },
      businessResponse: 'Review added to profile, thank you message sent, testimonial considered for marketing'
    }
  ];

  return new Response(JSON.stringify({
    success: true,
    testType: 'webhook_flow',
    scenario: 'Complete customer journey through webhook notifications',
    simulation: {
      eventsProcessed: webhookEvents.length,
      timeline: webhookEvents,
      businessAutomation: [
        'Automatic calendar management',
        'Email sequence triggered',
        'Payment processing confirmed',
        'Review collection and display',
        'Metrics and analytics updated'
      ]
    },
    integrationHealth: {
      webhookEndpoint: 'https://installonce.ai/api/zenbid/webhook',
      status: 'active',
      averageResponseTime: '120ms',
      successRate: '99.8%'
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const POST: APIRoute = async ({ request }) => {
  // Allow POST requests to run specific test scenarios
  const { testType, params } = await request.json();
  
  // This could trigger actual API calls to test the integration
  return new Response(JSON.stringify({
    success: true,
    message: `Running live test: ${testType}`,
    note: 'Live testing implementation would make actual API calls here',
    params
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};